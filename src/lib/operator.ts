import { isEmail, isPhone } from "@/lib/contact";
import { ageBand, bmiBand } from "@/lib/study";
import type { AgeBand, BmiBand, CircadiaState, FaultEvent, RosterEvent, RosterEventV2 } from "@/lib/types";
import { APP_VERSION } from "@/lib/version";

export const ROSTER_SCHEMA = "circadia-roster-v1" as const;
export const ROSTER_SCHEMA_V2 = "circadia-roster-v2" as const;
export const FAULT_SCHEMA = "circadia-fault-v1" as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isClock(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function extraKeys(obj: object, allowed: Set<string>): string[] {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

export function buildRoster(state: CircadiaState): RosterEventV2 {
  const profile = state.profile;
  const participantId = state.study.participantId;
  if (!profile) throw new Error("No profile.");
  if (!participantId) throw new Error("No participant number.");
  return {
    schema: ROSTER_SCHEMA_V2,
    at: new Date().toISOString(),
    participantId,
    appVersion: APP_VERSION,
    ageBand: ageBand(profile.age),
    bmiBand: bmiBand(profile.heightCm, profile.weightKg),
    activity: profile.activity,
    struggles: [...profile.struggles],
    targetSleep: profile.targetSleep,
    targetWake: profile.targetWake,
  };
}

export function buildFault(
  state: CircadiaState,
  message: string,
  extra?: { stack?: string | null; href?: string | null },
): FaultEvent {
  const participantId = state.study.participantId;
  if (!participantId) throw new Error("No participant number.");
  return {
    schema: FAULT_SCHEMA,
    at: new Date().toISOString(),
    participantId,
    appVersion: APP_VERSION,
    message: String(message).trim().slice(0, 500) || "Unknown fault.",
    stack: extra?.stack ? String(extra.stack).slice(0, 1500) : null,
    href: extra?.href ? String(extra.href).slice(0, 120) : null,
  };
}

const ROSTER_KEYS = new Set([
  "schema",
  "at",
  "participantId",
  "appVersion",
  "name",
  "email",
  "phone",
  "age",
  "heightCm",
  "weightKg",
  "activity",
  "struggles",
  "targetSleep",
  "targetWake",
]);

const ROSTER_V2_KEYS = new Set([
  "schema",
  "at",
  "participantId",
  "appVersion",
  "ageBand",
  "bmiBand",
  "activity",
  "struggles",
  "targetSleep",
  "targetWake",
]);

const FAULT_KEYS = new Set(["schema", "at", "participantId", "appVersion", "message", "stack", "href"]);

export type RosterResult = { ok: true; value: RosterEvent } | { ok: false; error: string };
export type RosterV2Result = { ok: true; value: RosterEventV2 } | { ok: false; error: string };
export type FaultResult = { ok: true; value: FaultEvent } | { ok: false; error: string };

const AGE_BANDS: AgeBand[] = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const BMI_BANDS: BmiBand[] = [
  "unconfirmed",
  "underweight",
  "healthy",
  "overweight",
  "obesity-1",
  "obesity-2",
];

export function validateRoster(raw: unknown): RosterResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Roster must be an object." };
  }
  const extra = extraKeys(raw, ROSTER_KEYS);
  if (extra.length) return { ok: false, error: `Unknown roster field: ${extra[0]}` };
  const p = raw as Record<string, unknown>;
  if (p.schema !== ROSTER_SCHEMA) return { ok: false, error: "Unknown schema." };
  if (typeof p.at !== "string" || p.at.length < 10 || p.at.length > 40) {
    return { ok: false, error: "Invalid roster time." };
  }
  if (typeof p.participantId !== "string" || !UUID_RE.test(p.participantId)) {
    return { ok: false, error: "Invalid participant number." };
  }
  if (typeof p.appVersion !== "string" || p.appVersion.length > 32) {
    return { ok: false, error: "Invalid app version." };
  }
  if (
    p.name !== null &&
    (typeof p.name !== "string" || p.name.trim().length < 1 || p.name.length > 80)
  ) {
    return { ok: false, error: "Invalid name." };
  }
  if (p.email !== null && (typeof p.email !== "string" || !isEmail(p.email))) {
    return { ok: false, error: "Invalid email." };
  }
  if (p.phone !== null && (typeof p.phone !== "string" || !isPhone(p.phone))) {
    return { ok: false, error: "Invalid phone." };
  }
  if (typeof p.age !== "number" || p.age < 13 || p.age > 90) return { ok: false, error: "Invalid age." };
  if (typeof p.heightCm !== "number" || p.heightCm < 100 || p.heightCm > 250) {
    return { ok: false, error: "Invalid height." };
  }
  if (typeof p.weightKg !== "number" || p.weightKg < 30 || p.weightKg > 250) {
    return { ok: false, error: "Invalid weight." };
  }
  if (
    p.activity !== "sedentary" &&
    p.activity !== "light" &&
    p.activity !== "moderate" &&
    p.activity !== "high"
  ) {
    return { ok: false, error: "Invalid activity." };
  }
  if (!Array.isArray(p.struggles) || p.struggles.some((s) => s !== "falling" && s !== "staying")) {
    return { ok: false, error: "Invalid struggles." };
  }
  if (!isClock(p.targetSleep) || !isClock(p.targetWake)) {
    return { ok: false, error: "Invalid target clocks." };
  }
  return {
    ok: true,
    value: {
      schema: ROSTER_SCHEMA,
      at: p.at,
      participantId: p.participantId,
      appVersion: p.appVersion,
      name: typeof p.name === "string" ? p.name.trim() : null,
      email: p.email,
      phone: p.phone,
      age: p.age,
      heightCm: p.heightCm,
      weightKg: p.weightKg,
      activity: p.activity,
      struggles: p.struggles,
      targetSleep: p.targetSleep,
      targetWake: p.targetWake,
    } as RosterEvent,
  };
}

export function validateRosterV2(raw: unknown): RosterV2Result {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Roster must be an object." };
  }
  const extra = extraKeys(raw, ROSTER_V2_KEYS);
  if (extra.length) return { ok: false, error: `Unknown roster field: ${extra[0]}` };
  const p = raw as Record<string, unknown>;
  if (p.schema !== ROSTER_SCHEMA_V2) return { ok: false, error: "Unknown schema." };
  if (typeof p.at !== "string" || p.at.length < 10 || p.at.length > 40) {
    return { ok: false, error: "Invalid roster time." };
  }
  if (typeof p.participantId !== "string" || !UUID_RE.test(p.participantId)) {
    return { ok: false, error: "Invalid participant number." };
  }
  if (typeof p.appVersion !== "string" || p.appVersion.length > 32) {
    return { ok: false, error: "Invalid app version." };
  }
  if (!AGE_BANDS.includes(p.ageBand as AgeBand)) return { ok: false, error: "Invalid age band." };
  if (!BMI_BANDS.includes(p.bmiBand as BmiBand)) return { ok: false, error: "Invalid BMI band." };
  if (
    p.activity !== "sedentary" &&
    p.activity !== "light" &&
    p.activity !== "moderate" &&
    p.activity !== "high"
  ) {
    return { ok: false, error: "Invalid activity." };
  }
  if (!Array.isArray(p.struggles) || p.struggles.some((s) => s !== "falling" && s !== "staying")) {
    return { ok: false, error: "Invalid struggles." };
  }
  if (!isClock(p.targetSleep) || !isClock(p.targetWake)) {
    return { ok: false, error: "Invalid target clocks." };
  }
  return {
    ok: true,
    value: {
      schema: ROSTER_SCHEMA_V2,
      at: p.at,
      participantId: p.participantId,
      appVersion: p.appVersion,
      ageBand: p.ageBand as AgeBand,
      bmiBand: p.bmiBand as BmiBand,
      activity: p.activity,
      struggles: p.struggles as RosterEventV2["struggles"],
      targetSleep: p.targetSleep as string,
      targetWake: p.targetWake as string,
    },
  };
}

export function validateFault(raw: unknown): FaultResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Fault must be an object." };
  }
  const extra = extraKeys(raw, FAULT_KEYS);
  if (extra.length) return { ok: false, error: `Unknown fault field: ${extra[0]}` };
  const p = raw as Record<string, unknown>;
  if (p.schema !== FAULT_SCHEMA) return { ok: false, error: "Unknown schema." };
  if (typeof p.at !== "string" || p.at.length < 10 || p.at.length > 40) {
    return { ok: false, error: "Invalid fault time." };
  }
  if (typeof p.participantId !== "string" || !UUID_RE.test(p.participantId)) {
    return { ok: false, error: "Invalid participant number." };
  }
  if (typeof p.appVersion !== "string" || p.appVersion.length > 32) {
    return { ok: false, error: "Invalid app version." };
  }
  if (typeof p.message !== "string" || p.message.trim().length < 1 || p.message.length > 500) {
    return { ok: false, error: "Invalid fault message." };
  }
  if (p.stack !== null && (typeof p.stack !== "string" || p.stack.length > 1500)) {
    return { ok: false, error: "Invalid stack." };
  }
  if (p.href !== null && (typeof p.href !== "string" || p.href.length > 120)) {
    return { ok: false, error: "Invalid href." };
  }
  return {
    ok: true,
    value: {
      schema: FAULT_SCHEMA,
      at: p.at,
      participantId: p.participantId,
      appVersion: p.appVersion,
      message: p.message.trim().slice(0, 500),
      stack: p.stack,
      href: p.href,
    },
  };
}
