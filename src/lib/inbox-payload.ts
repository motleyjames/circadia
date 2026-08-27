import { FAULT_SCHEMA, ROSTER_SCHEMA, validateFault, validateRoster } from "@/lib/operator";
import { STUDY_SCHEMA, validateStudyPack } from "@/lib/study";
import type { FaultEvent, RosterEvent, StudyPack } from "@/lib/types";

export type InboxKind = "study" | "roster" | "fault";

export type ParsedInbox =
  | { ok: true; kind: "study"; value: StudyPack }
  | { ok: true; kind: "roster"; value: RosterEvent }
  | { ok: true; kind: "fault"; value: FaultEvent }
  | { ok: false; error: string };

export function parseInboxPayload(raw: unknown): ParsedInbox {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Body must be an object." };
  }
  const schema = (raw as { schema?: unknown }).schema;
  if (schema === STUDY_SCHEMA) {
    const parsed = validateStudyPack(raw);
    return parsed.ok ? { ok: true, kind: "study", value: parsed.value } : parsed;
  }
  if (schema === ROSTER_SCHEMA) {
    const parsed = validateRoster(raw);
    return parsed.ok ? { ok: true, kind: "roster", value: parsed.value } : parsed;
  }
  if (schema === FAULT_SCHEMA) {
    const parsed = validateFault(raw);
    return parsed.ok ? { ok: true, kind: "fault", value: parsed.value } : parsed;
  }
  return { ok: false, error: "Unknown schema." };
}

export function inboxParticipantId(parsed: Exclude<ParsedInbox, { ok: false }>): string {
  return parsed.value.participantId;
}
