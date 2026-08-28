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
import { startScreenOffWatcher } from "@/lib/notifications";
import { buildFault, buildRoster } from "@/lib/operator";
import { AUTH_ERRORS, sessionAllowsLogout } from "@/lib/login";
import {
  attachLoginToCurrent,
  changePassword as changePasswordOnFile,
  closeFile,
  createFile,
  emptyState,
  eraseCurrentFile,
  getSessionLogin,
  importStateJson,
  loadState,
  openFile,
  saveState,
  bootVaultFromDisk,
} from "@/lib/storage";
import { anonymityViolations, buildStudyPack } from "@/lib/study";
import { postInbox } from "@/lib/study-client";
import type { CircadiaState, MorningReport, Profile, WindDownSession } from "@/lib/types";
import { newId } from "@/lib/time";

export type AuthResult = { ok: true } | { ok: false; error: string };

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
  try {
    await bootVaultFromDisk();
  } catch {
    /* localStorage still holds whatever this origin has */
  }
  bootReady = true;
  sessionMemory = undefined;
  memory = null;
  readyListeners.forEach((listener) => listener());
  emit();
}

function write(next: CircadiaState) {
  memory = next;
  saveState(next);
  emit();
}

function patch(updater: (prev: CircadiaState) => CircadiaState) {
  write(updater(snapshot()));
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

async function transmitRoster() {
  const current = snapshot();
  if (!current.study.consented || !current.study.participantId || !current.profile) return;
  try {
    const result = await postInbox(buildRoster(current));
    markSend(result.ok, result.error ?? null, {
      rosterSentAt: result.ok ? new Date().toISOString() : undefined,
    });
  } catch {
    markSend(false, "Could not send the roster card.");
  }
}

async function transmitStudy() {
  const current = snapshot();
  if (!current.study.consented || !current.study.participantId) return;
  try {
    const pack = buildStudyPack(current);
    const leaks = anonymityViolations(pack, current);
    if (leaks.length) {
      patch((prev) => ({
        ...prev,
        study: {
          ...prev.study,
          lastStatus: "blocked",
          lastError: "Pack failed the anonymity check. Nothing left this computer.",
        },
      }));
      return;
    }
    const result = await postInbox(pack);
    markSend(result.ok, result.error ?? null);
  } catch {
    markSend(false, "Could not build a pack from this diary.");
  }
}

async function transmitFault(message: string, extra?: { stack?: string | null; href?: string | null }) {
  const current = snapshot();
  if (!current.study.consented || !current.study.participantId) return;
  try {
    await postInbox(buildFault(current, message, extra));
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
  saveProfile: (profile: Profile) => void;
  addReport: (report: Omit<MorningReport, "id" | "createdAt">) => void;
  removeLatestReport: () => void;
  addSession: (session: Omit<WindDownSession, "id">) => void;
  sendChat: (text: string) => void;
  newConsult: () => void;
  openConsult: (id: string) => void;
  deleteConsult: (id: string) => void;
  setResearchNotes: (notes: string) => void;
  importJson: (raw: string) => void;
  loadSampleWeek: () => void;
  resetAll: () => void;
  joinStudy: () => void;
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
  saveProfile: noop,
  addReport: noop,
  removeLatestReport: noop,
  addSession: noop,
  sendChat: noop,
  newConsult: noop,
  openConsult: noop,
  deleteConsult: noop,
  setResearchNotes: noop,
  importJson: noop,
  loadSampleWeek: noop,
  resetAll: noop,
  joinStudy: noop,
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

  useEffect(() => {
    void finishVaultBoot();
  }, []);

  useEffect(() => {
    if (!state.profile?.notificationsEnabled || !state.profile.targetSleep) return;
    return startScreenOffWatcher(state.profile.targetSleep, true);
  }, [state.profile?.notificationsEnabled, state.profile?.targetSleep]);

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
    const full: MorningReport = {
      ...report,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    let shouldSend = false;
    patch((prev) => {
      shouldSend = Boolean(prev.study.consented && !prev.demoWeek);
      return {
        ...prev,
        demoWeek: false,
        reports: [...prev.reports.filter((r) => r.morningDate !== full.morningDate), full].sort((a, b) =>
          a.morningDate.localeCompare(b.morningDate),
        ),
      };
    });
    if (shouldSend) {
      if (!snapshot().study.rosterSentAt) void transmitRoster();
      void transmitStudy();
    }
  }, []);

  const removeLatestReport = useCallback(() => {
    patch((prev) => {
      if (!prev.reports.length) return prev;
      const latest = [...prev.reports].sort((a, b) => a.morningDate.localeCompare(b.morningDate)).at(-1);
      if (!latest) return prev;
      return {
        ...prev,
        reports: prev.reports.filter((r) => r.id !== latest.id),
      };
    });
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
    closeFile();
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

  const resetAll = useCallback(() => {
    eraseCurrentFile();
    sessionMemory = null;
    memory = emptyState();
    emit();
  }, []);

  const joinStudy = useCallback(() => {
    patch((prev) => ({
      ...prev,
      study: {
        ...prev.study,
        asked: true,
        consented: true,
        participantId: prev.study.participantId ?? crypto.randomUUID(),
        lastError: null,
        rosterSentAt: null,
      },
    }));
    void transmitRoster();
    if (snapshot().reports.length) void transmitStudy();
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
      },
    }));
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
      saveProfile,
      addReport,
      removeLatestReport,
      addSession,
      sendChat,
      newConsult,
      openConsult,
      deleteConsult,
      setResearchNotes,
      importJson,
      loadSampleWeek,
      resetAll,
      joinStudy,
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
      saveProfile,
      addReport,
      removeLatestReport,
      addSession,
      sendChat,
      newConsult,
      openConsult,
      deleteConsult,
      setResearchNotes,
      importJson,
      loadSampleWeek,
      resetAll,
      joinStudy,
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
