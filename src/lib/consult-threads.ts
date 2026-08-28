import type { ChatMessage, ChatRole, ConsultThread } from "@/lib/types";
import { newId } from "@/lib/time";

export const MAX_CONSULTS = 80;
export const MAX_CONSULT_MESSAGES = 200;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function consultTitle(messages: ChatMessage[]): string {
  const first = messages.find((msg) => msg.role === "you")?.text.trim().replace(/\s+/g, " ") ?? "";
  if (!first) return "Consult";
  if (first.length <= 48) return first;
  return `${first.slice(0, 47).trimEnd()}…`;
}

export function localDayKey(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return localDayKeyFromDate(now);
  }
  return localDayKeyFromDate(date);
}

export function localDayKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftLocalDay(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return localDayKeyFromDate(date);
}

export function consultDayLabel(key: string, now = new Date()): string {
  const today = localDayKeyFromDate(now);
  if (key === today) return "Today";
  if (key === shiftLocalDay(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(date.getTime())) return key;
  const label = `${WEEKDAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? label : `${label}, ${date.getFullYear()}`;
}

export function formatConsultTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = date.getHours() * 60 + date.getMinutes();
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function threadFromLive(messages: ChatMessage[], id?: string | null): ConsultThread | null {
  if (messages.length === 0) return null;
  const createdAt = messages[0]?.createdAt ?? new Date().toISOString();
  const updatedAt = messages[messages.length - 1]?.createdAt ?? createdAt;
  return {
    id: id && id.length >= 8 ? id : newId(),
    title: consultTitle(messages),
    createdAt,
    updatedAt,
    messages: messages.slice(-MAX_CONSULT_MESSAGES),
  };
}

export function upsertConsult(history: ConsultThread[], thread: ConsultThread): ConsultThread[] {
  const next = history.filter((item) => item.id !== thread.id);
  return [thread, ...next]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONSULTS);
}

export function parkLiveConsult(state: {
  chat: ChatMessage[];
  consultHistory: ConsultThread[];
  activeConsultId: string | null;
}): { chat: ChatMessage[]; consultHistory: ConsultThread[]; activeConsultId: null } {
  const live = threadFromLive(state.chat, state.activeConsultId);
  return {
    chat: [],
    activeConsultId: null,
    consultHistory: live ? upsertConsult(state.consultHistory, live) : state.consultHistory,
  };
}

export type ConsultDayGroup = {
  key: string;
  label: string;
  threads: ConsultThread[];
};

export function groupConsultsByDay(threads: ConsultThread[], now = new Date()): ConsultDayGroup[] {
  const groups = new Map<string, ConsultThread[]>();
  const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const thread of sorted) {
    const key = localDayKey(thread.updatedAt, now);
    const list = groups.get(key) ?? [];
    list.push(thread);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, list]) => ({
    key,
    label: consultDayLabel(key, now),
    threads: list,
  }));
}

export function consultMessages(chat: ChatMessage[], history: ConsultThread[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const thread of history) {
    for (const msg of thread.messages) byId.set(msg.id, msg);
  }
  for (const msg of chat) byId.set(msg.id, msg);
  return [...byId.values()];
}

export function coerceChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ChatMessage>;
  const role: ChatRole | null = raw.role === "you" || raw.role === "circadia" ? raw.role : null;
  if (!role || typeof raw.text !== "string" || !raw.text.trim()) return null;
  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : newId(),
    role,
    text: raw.text,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    citations: Array.isArray(raw.citations)
      ? raw.citations.filter((id): id is string => typeof id === "string")
      : undefined,
  };
}

export function coerceChat(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.map(coerceChatMessage).filter((msg): msg is ChatMessage => msg !== null);
}

export function coerceConsultHistory(value: unknown): ConsultThread[] {
  if (!Array.isArray(value)) return [];
  const threads = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<ConsultThread>;
      const messages = coerceChat(raw.messages);
      if (messages.length === 0) return null;
      const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : (messages[0]?.createdAt ?? new Date().toISOString());
      const updatedAt =
        typeof raw.updatedAt === "string"
          ? raw.updatedAt
          : (messages[messages.length - 1]?.createdAt ?? createdAt);
      return {
        id: typeof raw.id === "string" && raw.id.length >= 8 ? raw.id : newId(),
        title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 80) : consultTitle(messages),
        createdAt,
        updatedAt,
        messages: messages.slice(-MAX_CONSULT_MESSAGES),
      } satisfies ConsultThread;
    })
    .filter((thread): thread is ConsultThread => thread !== null);
  return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_CONSULTS);
}
