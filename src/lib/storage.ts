import type { CircadiaState } from "@/lib/types";

export const STORAGE_KEY = "circadia:v1";

export const emptyState = (): CircadiaState => ({
  profile: null,
  reports: [],
  sessions: [],
  chat: [],
  researchNotes: "",
});

export function loadState(): CircadiaState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<CircadiaState>;
    return {
      ...emptyState(),
      ...parsed,
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      chat: Array.isArray(parsed.chat) ? parsed.chat : [],
      researchNotes: typeof parsed.researchNotes === "string" ? parsed.researchNotes : "",
      profile: parsed.profile ?? null,
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: CircadiaState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state: CircadiaState): string {
  return JSON.stringify(state, null, 2);
}

export function importStateJson(raw: string): CircadiaState {
  const parsed = JSON.parse(raw) as Partial<CircadiaState>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Not a Circadia file.");
  }
  return {
    ...emptyState(),
    ...parsed,
    reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    chat: Array.isArray(parsed.chat) ? parsed.chat : [],
    researchNotes: typeof parsed.researchNotes === "string" ? parsed.researchNotes : "",
    profile: parsed.profile ?? null,
  };
}
