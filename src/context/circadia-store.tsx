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
import { sampleWeekState } from "@/lib/demo";
import { installFaultReporter } from "@/lib/fault-reporter";
import { startScreenOffWatcher } from "@/lib/notifications";
import { buildFault, buildRoster } from "@/lib/operator";
import { emptyState, importStateJson, loadState, saveState } from "@/lib/storage";
import { anonymityViolations, buildStudyPack } from "@/lib/study";
import { postInbox } from "@/lib/study-client";
import type { CircadiaState, MorningReport, Profile, WindDownSession } from "@/lib/types";
import { newId } from "@/lib/time";

const listeners = new Set<() => void>();
let memory: CircadiaState | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): CircadiaState {
  if (!memory) memory = loadState();
  return memory;
}

const SERVER_STATE = emptyState();

function serverSnapshot(): CircadiaState {
  return SERVER_STATE;
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
  saveProfile: (profile: Profile) => void;
  addReport: (report: Omit<MorningReport, "id" | "createdAt">) => void;
  removeLatestReport: () => void;
  addSession: (session: Omit<WindDownSession, "id">) => void;
  sendChat: (text: string) => void;
  clearChat: () => void;
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

function noopSubscribe() {
  return () => undefined;
}

export function CircadiaProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const rosterCatchUp = useRef(false);

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
      return { ...prev, chat: [...prev.chat, you, circadia].slice(-200) };
    });
  }, []);

  const clearChat = useCallback(() => {
    patch((prev) => ({ ...prev, chat: [] }));
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

  const resetAll = useCallback(() => {
    write(emptyState());
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
      saveProfile,
      addReport,
      removeLatestReport,
      addSession,
      sendChat,
      clearChat,
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
      saveProfile,
      addReport,
      removeLatestReport,
      addSession,
      sendChat,
      clearChat,
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
  // Next still prerenders diary pages while compiling the operator (no layout).
  // Browser stays strict: a missing provider is a real bug.
  if (typeof window === "undefined") {
    const noop = () => undefined;
    return {
      ready: false,
      state: SERVER_STATE,
      saveProfile: noop,
      addReport: noop,
      removeLatestReport: noop,
      addSession: noop,
      sendChat: noop,
      clearChat: noop,
      setResearchNotes: noop,
      importJson: noop,
      loadSampleWeek: noop,
      resetAll: noop,
      joinStudy: noop,
      declineStudy: noop,
      leaveStudy: noop,
      sendStudyNow: async () => undefined,
    };
  }
  throw new Error("useCircadia must be used inside CircadiaProvider");
}
