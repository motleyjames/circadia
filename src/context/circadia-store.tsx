"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { answerQuestion, makeChatMessage } from "@/lib/chat";
import { sampleWeekState } from "@/lib/demo";
import { startScreenOffWatcher } from "@/lib/notifications";
import { emptyState, importStateJson, loadState, saveState } from "@/lib/storage";
import { anonymityViolations, buildStudyPack } from "@/lib/study";
import { postStudyPack } from "@/lib/study-client";
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
    const result = await postStudyPack(pack);
    patch((prev) => ({
      ...prev,
      study: {
        ...prev.study,
        lastSentAt: result.ok ? new Date().toISOString() : prev.study.lastSentAt,
        lastStatus: result.ok ? "sent" : "error",
        lastError: result.ok ? null : (result.error ?? "Send failed."),
      },
    }));
  } catch {
    patch((prev) => ({
      ...prev,
      study: {
        ...prev.study,
        lastStatus: "error",
        lastError: "Could not build a pack from this diary.",
      },
    }));
  }
}

type CircadiaContextValue = {
  ready: boolean;
  state: CircadiaState;
  saveProfile: (profile: Profile) => void;
  addReport: (report: Omit<MorningReport, "id" | "createdAt">) => void;
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

  useEffect(() => {
    if (!state.profile?.notificationsEnabled || !state.profile.targetSleep) return;
    return startScreenOffWatcher(state.profile.targetSleep, true);
  }, [state.profile?.notificationsEnabled, state.profile?.targetSleep]);

  const saveProfile = useCallback((profile: Profile) => {
    patch((prev) => ({ ...prev, profile }));
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
    if (shouldSend) void transmitStudy();
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
      },
    }));
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
      },
    }));
  }, []);

  const sendStudyNow = useCallback(async () => {
    await transmitStudy();
  }, []);

  const value = useMemo(
    () => ({
      ready,
      state,
      saveProfile,
      addReport,
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
  if (!ctx) throw new Error("useCircadia must be used inside CircadiaProvider");
  return ctx;
}
