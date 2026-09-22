"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { answerQuestion, makeChatMessage } from "@/lib/chat";
import { threadFromLive, upsertConsult } from "@/lib/consult-threads";
import { sampleWeekState } from "@/lib/demo";
import { installFaultReporter } from "@/lib/fault-reporter";
import {
  confirmNotificationsOnce,
  markReminderOffered,
  notificationPermission,
  reminderOfferMade,
  requestNotificationPermission,
  syncNotifications,
} from "@/lib/notify-device";
import { buildFault, buildRoster } from "@/lib/operator";
import { AUTH_ERRORS, sessionAllowsLogout } from "@/lib/login";
import {
  attachLoginToCurrent,
  changePassword as changePasswordOnFile,
  closeFile,
  createFile,
  emptyState,
  enableRecovery as enableRecoveryOnFile,
  eraseCurrentFile,
  foldLockedVaultIntoSession,
  absorbPeerNights,
  getSessionLogin,
  importStateJson,
  loadState,
  openFile,
  recoverFile,
  saveState,
  bootVaultFromDisk,
} from "@/lib/storage";
import { isPhoneNative } from "@/lib/phone-native";
import { enrollWithInvite, flagNightAt, recordDisclosureFlags } from "@/lib/invite";
import { applyDelivery, deliverPhonePack } from "@/lib/pack-deliver";
import { capacitorPackHttp } from "@/lib/pack-http";
import { operatorPublicRaw } from "@/lib/operator-public";
import { assertSendable, buildStudyPack } from "@/lib/study";
import { postInbox, STUDY_HELD_ERROR } from "@/lib/study-client";
import { applyBackfill, retainMorningDraft } from "@/lib/backfill";
import {
  reportForMorning,
  upsertMorningReport,
  withdrawMorningReport,
} from "@/lib/morning-file";
import type { CircadiaState, IntakeDraft, MorningDraft, MorningReport, Profile, WindDownSession } from "@/lib/types";
import { formatClock, newId, screenOffClock, todayIsoDate } from "@/lib/time";
import type { DiskVault } from "@/lib/vault";

export type AuthResult = { ok: true } | { ok: false; error: string };
export type FoldResult = { ok: true; added: number } | { ok: false; error: string };

const listeners = new Set<() => void>();
let memory: CircadiaState | null = null;
/** undefined = not read from disk yet. */
let sessionMemory: string | null | undefined = undefined;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): CircadiaState {
  if (typeof window === "undefined") return memory ?? SERVER_STATE;
  const disk = getSessionLogin();
  if (sessionMemory !== disk) {
    sessionMemory = disk;
    memory = disk ? loadState() : emptyState();
  } else if (!memory) {
    memory = loadState();
  }
  return memory ?? SERVER_STATE;
}

function currentSession(): string | null {
  snapshot();
  return sessionMemory ?? null;
}

const SERVER_STATE = emptyState();
const SERVER_SESSION: string | null = null;

function serverSnapshot(): CircadiaState {
  return SERVER_STATE;
}

function serverSession(): string | null {
  return SERVER_SESSION;
}

let bootReady = false;
const readyListeners = new Set<() => void>();
let bootInFlight: Promise<void> | null = null;

function subscribeReady(listener: () => void) {
  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
}

function snapshotReady() {
  return bootReady;
}

function serverReady() {
  return false;
}

async function finishVaultBoot() {
  if (bootReady) return;
  if (bootInFlight) {
    await bootInFlight;
    return;
  }
  bootInFlight = (async () => {
    try {
      // A remount of CircadiaProvider must not reboot-wipe a live unlock.
      if (!getSessionLogin()) {
        await bootVaultFromDisk();
      }
    } catch {
      /* localStorage still holds whatever this origin has */
    }
    bootReady = true;
    sessionMemory = undefined;
    memory = null;
    readyListeners.forEach((listener) => listener());
    emit();
  })();
  try {
    await bootInFlight;
  } finally {
    bootInFlight = null;
  }
}

function write(next: CircadiaState) {
  memory = next;
  saveState(next);
  emit();
}

function patch(updater: (prev: CircadiaState) => CircadiaState) {
  write(updater(snapshot()));
}

function markHeld(error: string | null) {
  patch((prev) => ({
    ...prev,
    study: {
      ...prev.study,
      lastStatus: "held",
      lastError: error ?? "Kept on this phone.",
    },
  }));
}

function markSend(ok: boolean, error: string | null, extra?: { rosterSentAt?: string }) {
  patch((prev) => ({
    ...prev,
    study: {
      ...prev.study,
      lastSentAt: ok ? new Date().toISOString() : prev.study.lastSentAt,
      lastStatus: ok ? "sent" : "error",
      lastError: ok ? null : (error ?? "Send failed."),
      rosterSentAt: extra?.rosterSentAt ?? prev.study.rosterSentAt,
    },
  }));
}

function markBlocked() {
  patch((prev) => ({
    ...prev,
    study: {
      ...prev.study,
      lastStatus: "blocked",
      lastError: "Pack failed the anonymity check. Nothing left this device.",
    },
  }));
}

async function transmitRoster() {
  const current = snapshot();
  if (!current.study.consented || !current.study.participantId || !current.profile) return;
  try {
    const payload = buildRoster(current);
    if (assertSendable(payload, current).length) {
      markBlocked();
      return;
    }
    const result = await postInbox(payload);
    if (result.held) {
      markHeld(result.error ?? null);
      return;
    }
    markSend(result.ok, result.error ?? null, {
      rosterSentAt: result.ok ? new Date().toISOString() : undefined,
    });
  } catch {
    markSend(false, "Could not send the roster card.");
  }
}

let phoneSendLock: Promise<void> = Promise.resolve();

async function flushPhoneDelivery() {
  const run = async () => {
    if (!isPhoneNative()) return;
    const current = snapshot();
    if (current.study.inviteVersion === 1) return;
    const raw = operatorPublicRaw();
    if (!raw) {
      if (current.study.inviteVersion === 2 || current.study.withdrawnAt) {
        patch((prev) => ({
          ...prev,
          study: applyDelivery(prev.study, {
            status: "failed",
            error: "Operator's public key is missing from this install.",
          }),
        }));
      }
      return;
    }
    try {
      const http = await capacitorPackHttp();
      const result = await deliverPhonePack({ state: snapshot(), operatorPublicRaw: raw, http });
      if (result.status === "skipped") return;
      patch((prev) => ({ ...prev, study: applyDelivery(prev.study, result) }));
    } catch {
      patch((prev) => ({
        ...prev,
        study: applyDelivery(prev.study, {
          status: "failed",
          error: "Could not reach the Worker. The pack is still on this device.",
        }),
      }));
    }
  };
  phoneSendLock = phoneSendLock.then(run, run);
  await phoneSendLock;
}

async function transmitStudy() {
  if (isPhoneNative()) {
    await flushPhoneDelivery();
    return;
  }
  const current = snapshot();
  if (!current.study.consented || !current.study.participantId) return;
  try {
    const pack = buildStudyPack(current);
    if (assertSendable(pack, current).length) {
      markBlocked();
      return;
    }
    const result = await postInbox(pack);
    if (result.held) {
      markHeld(result.error ?? null);
      return;
    }
    markSend(result.ok, result.error ?? null);
  } catch {
    markSend(false, "Could not build a pack from this diary.");
  }
}

async function transmitFault(message: string, extra?: { stack?: string | null; href?: string | null }) {
  const current = snapshot();
  if (!current.study.consented || !current.study.participantId) return;
  try {
    const payload = buildFault(current, message, extra);
    if (assertSendable(payload, current).length) {
      markBlocked();
      return;
    }
    await postInbox(payload);
  } catch {
    // faults are best-effort
  }
}

type CircadiaContextValue = {
  ready: boolean;
  state: CircadiaState;
  session: string | null;
  canLogOut: boolean;
  signUp: (input: {
    firstName: string;
    lastName: string;
    contact: string;
    password: string;
    confirm: string;
  }) => Promise<AuthResult>;
  logIn: (contact: string, password: string) => Promise<AuthResult>;
  logOut: () => void;
  attachLogin: (contact: string, password: string, confirm: string) => Promise<AuthResult>;
  changePassword: (current: string, next: string, confirm: string) => Promise<AuthResult>;
  saveRecoveryCode: (code: string, confirm: string) => Promise<AuthResult>;
  recoverWithCode: (contact: string, code: string) => Promise<AuthResult>;
  saveProfile: (profile: Profile) => void;
  addReport: (report: Omit<MorningReport, "id" | "createdAt">) => void;
  saveMorningDraft: (draft: MorningDraft | null) => void;
  saveIntakeDraft: (draft: IntakeDraft | null) => void;
  withdrawMorning: (morningDate: string) => void;
  addSession: (session: Omit<WindDownSession, "id">) => void;
  sendChat: (text: string) => void;
  newConsult: () => void;
  openConsult: (id: string) => void;
  deleteConsult: (id: string) => void;
  setResearchNotes: (notes: string) => void;
  importJson: (raw: string) => void;
  foldLockedDiary: (vault: DiskVault) => Promise<FoldResult>;
  loadSampleWeek: () => void;
  resetAll: () => void;
  joinStudy: () => void;
  enrollSolo: (code: string) => Promise<boolean>;
  declineStudy: () => void;
  leaveStudy: () => void;
  sendStudyNow: () => Promise<void>;
};

const CircadiaContext = createContext<CircadiaContextValue | null>(null);

const noop = () => undefined;

const NOOP_VALUE: CircadiaContextValue = {
  ready: false,
  state: SERVER_STATE,
  session: null,
  canLogOut: false,
  signUp: async () => ({ ok: false as const, error: AUTH_ERRORS.noop }),
  logIn: async () => ({ ok: false as const, error: AUTH_ERRORS.noop }),
  logOut: noop,
  attachLogin: async () => ({ ok: false as const, error: AUTH_ERRORS.noop }),
  changePassword: async () => ({ ok: false as const, error: AUTH_ERRORS.noop }),
  saveRecoveryCode: async () => ({ ok: false as const, error: AUTH_ERRORS.noop }),
  recoverWithCode: async () => ({ ok: false as const, error: AUTH_ERRORS.noop }),
  saveProfile: noop,
  addReport: noop,
  saveMorningDraft: noop,
  saveIntakeDraft: noop,
  withdrawMorning: noop,
  addSession: noop,
  sendChat: noop,
  newConsult: noop,
  openConsult: noop,
  deleteConsult: noop,
  setResearchNotes: noop,
  importJson: noop,
  foldLockedDiary: async () => ({ ok: false as const, error: AUTH_ERRORS.noop }),
  loadSampleWeek: noop,
  resetAll: noop,
  joinStudy: noop,
  enrollSolo: async () => false,
  declineStudy: noop,
  leaveStudy: noop,
  sendStudyNow: async () => undefined,
};

/** Operator has no diary file. Still provide context so /check-in cannot throw during compile. */
export function CircadiaSafeTree({ children }: { children: ReactNode }) {
  return <CircadiaContext.Provider value={NOOP_VALUE}>{children}</CircadiaContext.Provider>;
}

export function CircadiaProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const session = useSyncExternalStore(subscribe, currentSession, serverSession);
  const ready = useSyncExternalStore(subscribeReady, snapshotReady, serverReady);
  const rosterCatchUp = useRef(false);

  const peerFold = useRef(false);

  useEffect(() => {
    void finishVaultBoot();
  }, []);

  // Re-plan the device's notifications whenever anything they depend on moves: the
  // toggle, either target, or the set of filed mornings. syncNotifications replaces
  // the whole pending set, so a reminder can never outlive the reason for it — the
  // morning ping for a morning just filed is gone before the app finishes saving.
  const notifyKey = state.profile
    ? [
        state.profile.notificationsEnabled,
        state.profile.targetSleep,
        state.profile.targetWake,
        state.profile.scheduledDays.join(""),
        state.reports.length,
        state.reports.at(-1)?.morningDate ?? "",
      ].join("|")
    : "";
  // Asked at most once per session, and only once the OS says asking is still
  // possible. The previous version asked only while filing the very first morning
  // ever, so anyone who already had a diary — which is everyone who had been using
  // the app — could never be prompted at all: the toggle read on, permission was
  // never granted, and every ping was dropped in silence.
  const askedThisSession = useRef(false);

  useEffect(() => {
    const profile = snapshot().profile;
    if (!profile) return;
    void (async () => {
      const state = await notificationPermission();

      // Offer once per device, when the OS says it has never asked and there is a
      // diary worth reminding someone about. Deliberately NOT gated on
      // notificationsEnabled: that flag defaults to false, so on every profile made
      // before reminders existed it reads like a decision and means "never asked".
      // Gating on it is why this app never appeared in iOS Settings at all.
      //
      // "Ask late" still holds — not at install, only once they have used the thing
      // the reminders are for. But late must not mean never.
      if (
        state === "prompt" &&
        snapshot().reports.length > 0 &&
        !askedThisSession.current &&
        !reminderOfferMade()
      ) {
        askedThisSession.current = true;
        markReminderOffered();
        const granted = await requestNotificationPermission();
        if (granted) {
          patch((prev) =>
            prev.profile ? { ...prev, profile: { ...prev.profile, notificationsEnabled: true } } : prev,
          );
        }
      }

      // Never leave a switch claiming to be on while the OS is dropping every ping.
      // Turning it back on in You is what routes them to Settings.
      if (snapshot().profile?.notificationsEnabled && (await notificationPermission()) === "denied") {
        patch((prev) =>
          prev.profile ? { ...prev, profile: { ...prev.profile, notificationsEnabled: false } } : prev,
        );
        return;
      }
      const live = snapshot().profile ?? profile;
      await syncNotifications({ profile: live, reports: snapshot().reports });

      // Confirm the feature works the first time it does, while the phone is still
      // in their hand. Without it the first thing anyone learns about reminders is
      // hours of silence, which is exactly what a broken build looks like.
      if (live.notificationsEnabled) {
        void confirmNotificationsOnce(formatClock(screenOffClock(live.targetSleep), live.units));
      }
    })();
    // notifyKey carries every input; snapshot() is read inside so the effect never
    // closes over a stale diary.
  }, [notifyKey]);

  useEffect(() => {
    return installFaultReporter((message, extra) => {
      void transmitFault(message, extra);
    }, () => snapshot().study.consented);
  }, []);

  useEffect(() => {
    if (!ready || rosterCatchUp.current) return;
    if (state.study.consented && !state.study.rosterSentAt && state.profile) {
      rosterCatchUp.current = true;
      void transmitRoster();
    }
  }, [ready, state.study.consented, state.study.rosterSentAt, state.profile]);

  useEffect(() => {
    if (!ready || !isPhoneNative()) return;
    if (state.study.inviteVersion === 1) return;
    if (!state.study.sendPending) return;
    void flushPhoneDelivery();
  }, [ready, state.study.sendPending, state.study.inviteVersion]);

  useEffect(() => {
    if (!ready || !session || peerFold.current) return;
    peerFold.current = true;
    void absorbPeerNights()
      .then((result) => {
        if (!result.state) return;
        memory = result.state;
        emit();
      })
      .catch(() => {
        /* leftover nights stay */
      });
  }, [ready, session]);

  const saveProfile = useCallback((profile: Profile) => {
    const prev = snapshot();
    const contactChanged =
      prev.profile?.email !== profile.email ||
      prev.profile?.phone !== profile.phone ||
      prev.profile?.name !== profile.name ||
      prev.profile?.age !== profile.age ||
      prev.profile?.heightCm !== profile.heightCm ||
      prev.profile?.weightKg !== profile.weightKg;
    patch((s) => ({ ...s, profile }));
    if (prev.study.consented && (contactChanged || !prev.study.rosterSentAt)) {
      void transmitRoster();
    }
  }, []);

  const addReport = useCallback((report: Omit<MorningReport, "id" | "createdAt">) => {
    let shouldSend = false;
    patch((prev) => {
      shouldSend = Boolean(prev.study.consented && !prev.demoWeek);
      const today = todayIsoDate();
      const existing = reportForMorning(prev.reports, report.morningDate);
      const full: MorningReport = {
        ...report,
        id: existing?.id ?? newId(),
        createdAt: new Date().toISOString(),
      };
      if (full.morningDate < today || full.filedLate) {
        const reports = applyBackfill(prev.reports, full, today, prev.episode);
        if (reports === prev.reports) {
          shouldSend = false;
          return prev;
        }
        return { ...prev, demoWeek: false, reports, morningDraft: null };
      }
      return {
        ...prev,
        demoWeek: false,
        reports: upsertMorningReport(prev.reports, full),
        morningDraft: null,
      };
    });
    if (shouldSend) {
      if (!snapshot().study.rosterSentAt) void transmitRoster();
      void transmitStudy();
    }
  }, []);

  const saveMorningDraft = useCallback((draft: MorningDraft | null) => {
    patch((prev) => {
      const kept = retainMorningDraft(draft, todayIsoDate(), prev.reports, prev.episode);
      if (JSON.stringify(prev.morningDraft) === JSON.stringify(kept)) return prev;
      return { ...prev, morningDraft: kept };
    });
  }, []);

  const saveIntakeDraft = useCallback((draft: IntakeDraft | null) => {
    patch((prev) => {
      if (JSON.stringify(prev.intakeDraft) === JSON.stringify(draft)) return prev;
      return { ...prev, intakeDraft: draft };
    });
  }, []);

  const withdrawMorning = useCallback((morningDate: string) => {
    patch((prev) => ({
      ...prev,
      reports: withdrawMorningReport(prev.reports, morningDate),
    }));
  }, []);

  const addSession = useCallback((session: Omit<WindDownSession, "id">) => {
    patch((prev) => ({
      ...prev,
      sessions: [...prev.sessions, { ...session, id: newId() }].slice(-40),
    }));
  }, []);

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    patch((prev) => {
      const you = makeChatMessage("you", trimmed);
      const reply = answerQuestion(trimmed, prev.profile, prev.reports, prev.chat);
      const circadia = makeChatMessage("circadia", reply.text, reply.citations);
      const messages = [...prev.chat, you, circadia].slice(-200);
      const id = prev.activeConsultId ?? newId();
      const thread = threadFromLive(messages, id);
      return {
        ...prev,
        chat: messages,
        activeConsultId: id,
        consultHistory: thread ? upsertConsult(prev.consultHistory, thread) : prev.consultHistory,
        safetyFlags: recordDisclosureFlags(prev.safetyFlags, trimmed, prev.profile, flagNightAt(prev)),
      };
    });
  }, []);

  const newConsult = useCallback(() => {
    patch((prev) => ({ ...prev, chat: [], activeConsultId: null }));
  }, []);

  const openConsult = useCallback((id: string) => {
    patch((prev) => {
      const thread = prev.consultHistory.find((item) => item.id === id);
      if (!thread) return prev;
      return { ...prev, chat: thread.messages, activeConsultId: thread.id };
    });
  }, []);

  const deleteConsult = useCallback((id: string) => {
    patch((prev) => {
      const consultHistory = prev.consultHistory.filter((item) => item.id !== id);
      if (prev.activeConsultId === id) {
        return { ...prev, consultHistory, chat: [], activeConsultId: null };
      }
      return { ...prev, consultHistory };
    });
  }, []);

  const setResearchNotes = useCallback((researchNotes: string) => {
    patch((prev) => ({ ...prev, researchNotes }));
  }, []);

  const importJson = useCallback((raw: string) => {
    write(importStateJson(raw));
  }, []);

  const foldLockedDiary = useCallback(async (vault: DiskVault): Promise<FoldResult> => {
    const result = await foldLockedVaultIntoSession(vault);
    if (!result.ok) return result;
    sessionMemory = result.login;
    memory = result.state;
    emit();
    return { ok: true, added: result.added };
  }, []);

  const loadSampleWeek = useCallback(() => {
    patch((prev) => sampleWeekState(prev));
  }, []);

  const signUp = useCallback(
    async (input: {
      firstName: string;
      lastName: string;
      contact: string;
      password: string;
      confirm: string;
    }): Promise<AuthResult> => {
      try {
        const result = await createFile(input);
        if (!result.ok) return result;
        sessionMemory = result.login;
        memory = result.state;
        emit();
        return { ok: true };
      } catch {
        return { ok: false, error: AUTH_ERRORS.credentials };
      }
    },
    [],
  );

  const logIn = useCallback(async (contact: string, password: string): Promise<AuthResult> => {
    try {
      const result = await openFile(contact, password);
      if (!result.ok) return result;
      sessionMemory = result.login;
      memory = result.state;
      emit();
      return { ok: true };
    } catch {
      return { ok: false, error: AUTH_ERRORS.credentials };
    }
  }, []);

  const logOut = useCallback(() => {
    void closeFile();
    sessionMemory = null;
    memory = emptyState();
    emit();
  }, []);

  const attachLogin = useCallback(
    async (contact: string, password: string, confirm: string): Promise<AuthResult> => {
      const result = await attachLoginToCurrent(contact, password, confirm);
      if (!result.ok) return result;
      sessionMemory = result.login;
      memory = result.state;
      emit();
      return { ok: true };
    },
    [],
  );

  const changePassword = useCallback(
    async (current: string, next: string, confirm: string): Promise<AuthResult> => {
      return changePasswordOnFile(current, next, confirm);
    },
    [],
  );

  const saveRecoveryCode = useCallback(async (code: string, confirm: string): Promise<AuthResult> => {
    return enableRecoveryOnFile(code, confirm);
  }, []);

  const recoverWithCode = useCallback(async (contact: string, code: string): Promise<AuthResult> => {
    try {
      const result = await recoverFile(contact, code);
      if (!result.ok) return result;
      sessionMemory = result.login;
      memory = result.state;
      emit();
      return { ok: true };
    } catch {
      return { ok: false, error: AUTH_ERRORS.recovery };
    }
  }, []);

  const resetAll = useCallback(() => {
    eraseCurrentFile();
    sessionMemory = null;
    memory = emptyState();
    emit();
  }, []);

  const joinStudy = useCallback(() => {
    // Re-consent only. A first join without an invite would mint an id Operator
    // never issued. Shakedown episodes start in enrollSolo.
    if (!snapshot().study.participantId) return;
    patch((prev) => {
      if (!prev.study.participantId) return prev;
      return {
        ...prev,
        study: {
          ...prev.study,
          asked: true,
          consented: true,
          lastError: null,
          rosterSentAt: null,
          withdrawnAt: null,
          sendPending: prev.study.inviteVersion === 2,
        },
      };
    });
    if (isPhoneNative()) {
      void flushPhoneDelivery();
      return;
    }
    void transmitRoster();
    if (snapshot().reports.length) void transmitStudy();
  }, []);

  const enrollSolo = useCallback(async (code: string) => {
    const next = await enrollWithInvite(snapshot(), code);
    if (!next) return false;
    patch(() => next);
    if (isPhoneNative()) {
      void flushPhoneDelivery();
      return true;
    }
    void transmitRoster();
    if (next.reports.length) void transmitStudy();
    return true;
  }, []);

  const declineStudy = useCallback(() => {
    patch((prev) => ({
      ...prev,
      study: {
        ...prev.study,
        asked: true,
        consented: false,
        participantId: prev.study.participantId,
        lastError: null,
      },
    }));
  }, []);

  const leaveStudy = useCallback(() => {
    patch((prev) => ({
      ...prev,
      study: {
        ...prev.study,
        asked: true,
        consented: false,
        lastError: null,
        rosterSentAt: null,
        withdrawnAt: new Date().toISOString(),
        sendPending: prev.study.inviteVersion === 2,
      },
    }));
    if (isPhoneNative()) void flushPhoneDelivery();
  }, []);

  const sendStudyNow = useCallback(async () => {
    await transmitRoster();
    await transmitStudy();
  }, []);

  const value = useMemo(
    () => ({
      ready,
      state,
      session,
      canLogOut: sessionAllowsLogout(session),
      signUp,
      logIn,
      logOut,
      attachLogin,
      changePassword,
      saveRecoveryCode,
      recoverWithCode,
      saveProfile,
      addReport,
      saveMorningDraft,
      saveIntakeDraft,
      withdrawMorning,
      addSession,
      sendChat,
      newConsult,
      openConsult,
      deleteConsult,
      setResearchNotes,
      importJson,
      foldLockedDiary,
      loadSampleWeek,
      resetAll,
      joinStudy,
      enrollSolo,
      declineStudy,
      leaveStudy,
      sendStudyNow,
    }),
    [
      ready,
      state,
      session,
      signUp,
      logIn,
      logOut,
      attachLogin,
      changePassword,
      saveRecoveryCode,
      recoverWithCode,
      saveProfile,
      addReport,
      saveMorningDraft,
      saveIntakeDraft,
      withdrawMorning,
      addSession,
      sendChat,
      newConsult,
      openConsult,
      deleteConsult,
      setResearchNotes,
      importJson,
      foldLockedDiary,
      loadSampleWeek,
      resetAll,
      joinStudy,
      enrollSolo,
      declineStudy,
      leaveStudy,
      sendStudyNow,
    ],
  );

  return <CircadiaContext.Provider value={value}>{children}</CircadiaContext.Provider>;
}

export function useCircadia() {
  const ctx = useContext(CircadiaContext);
  if (ctx) return ctx;
  // Operator compile prerenders /insights, /check-in, etc. without the diary
  // tree. A throw here is what killed Circadia Operator.app on the Mac.
  return NOOP_VALUE;
}
