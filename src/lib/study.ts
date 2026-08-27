import { medicationClasses } from "@/lib/metrics";
import { bmiKgM, DEFAULT_HEIGHT_CM, DEFAULT_WEIGHT_KG, overnightDuration } from "@/lib/time";
import type {
  AgeBand,
  BmiBand,
  CircadiaState,
  MedicationClass,
  StudyNight,
  StudyPack,
} from "@/lib/types";
import { APP_VERSION } from "@/lib/version";

export const STUDY_SCHEMA = "circadia-study-v1" as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AGE_BANDS: AgeBand[] = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const BMI_BANDS: BmiBand[] = [
  "unconfirmed",
  "underweight",
  "healthy",
  "overweight",
  "obesity-1",
  "obesity-2",
];
const MED_CLASSES: MedicationClass[] = [
  "stimulant",
  "bupropion",
  "antidepressant",
  "steroid",
  "decongestant",
  "beta-blocker",
  "antihistamine",
  "other",
];

export function ageBand(age: number): AgeBand {
  if (age < 18) return "13-17";
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  if (age < 65) return "55-64";
  return "65+";
}

export function bmiBand(heightCm: number, weightKg: number): BmiBand {
  if (heightCm === DEFAULT_HEIGHT_CM && weightKg === DEFAULT_WEIGHT_KG) return "unconfirmed";
  const bmi = bmiKgM(weightKg, heightCm);
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "healthy";
  if (bmi < 30) return "overweight";
  if (bmi < 35) return "obesity-1";
  return "obesity-2";
}

export function buildStudyPack(state: CircadiaState): StudyPack {
  const profile = state.profile;
  const participantId = state.study.participantId;
  if (!profile) throw new Error("No profile.");
  if (!participantId) throw new Error("No participant number.");

  const nights: StudyNight[] = [...state.reports]
    .sort((a, b) => a.morningDate.localeCompare(b.morningDate))
    .map((report, nightIndex) => {
      const night: StudyNight = {
        nightIndex,
        fellAsleepAt: report.fellAsleepAt,
        wokeAt: report.wokeAt,
        durationMinutes: overnightDuration(report.fellAsleepAt, report.wokeAt),
        rating: report.rating,
        drank: report.drank,
        screenOffMinutes: report.screenOffMinutes,
        sleepLatencyMinutes: report.sleepLatencyMinutes,
        wokeInNight: report.wokeInNight,
        nightWakingMinutes: report.nightWakingMinutes,
        usedSupplement: report.usedSupplement,
        windDownHelped: report.windDownHelped,
        hadDream: Boolean(report.dream?.text),
      };
      if (report.drank && typeof report.drinkCount === "number") night.drinkCount = report.drinkCount;
      if (typeof report.spins === "boolean") night.spins = report.spins;
      if (report.usedSupplement && report.supplementKind) night.supplementKind = report.supplementKind;
      return night;
    });

  const topics = [
    ...new Set(
      state.chat.flatMap((msg) => (msg.role === "circadia" && msg.citations ? msg.citations : [])),
    ),
  ].sort();

  return {
    schema: STUDY_SCHEMA,
    participantId,
    appVersion: APP_VERSION,
    surface: "desktop",
    demoWeek: state.demoWeek,
    profile: {
      ageBand: ageBand(profile.age),
      sex: profile.sex,
      struggles: [...profile.struggles],
      activity: profile.activity,
      bmiBand: bmiBand(profile.heightCm, profile.weightKg),
      medicationClasses: medicationClasses(profile.medications),
      supplementCount: profile.supplements.filter((s) => s.trim()).length,
      targetSleep: profile.targetSleep,
      targetWake: profile.targetWake,
    },
    nights,
    sessions: {
      meditation: state.sessions.filter((s) => s.kind === "meditation").length,
      soundscape: state.sessions.filter((s) => s.kind === "soundscape").length,
      completed: state.sessions.filter((s) => s.completed).length,
    },
    chat: {
      turns: state.chat.length,
      topics,
    },
  };
}

const DISTINCTIVE = 12;

function distinctiveSlices(text: string): string[] {
  const t = text.trim().toLowerCase();
  if (t.length < DISTINCTIVE) return t.length >= 5 ? [t] : [];
  const slices = [t.slice(0, DISTINCTIVE)];
  if (t.length > DISTINCTIVE * 2) slices.push(t.slice(Math.floor(t.length / 2), Math.floor(t.length / 2) + DISTINCTIVE));
  return slices;
}

/** Fail closed: if a pack still contains a local secret, do not send it. */
export function anonymityViolations(pack: StudyPack, state: CircadiaState): string[] {
  const blob = JSON.stringify(pack).toLowerCase();
  const hits: string[] = [];

  const name = state.profile?.name?.trim() ?? "";
  if (name.length >= 3 && name.toLowerCase() !== "you" && blob.includes(name.toLowerCase())) {
    hits.push("name");
  }

  const email = state.profile?.email?.trim().toLowerCase() ?? "";
  if (email.length >= 6 && blob.includes(email)) hits.push("email");
  const phoneDigits = (state.profile?.phone ?? "").replace(/\D/g, "");
  if (phoneDigits.length >= 7 && blob.includes(phoneDigits)) hits.push("phone");

  for (const med of state.profile?.medications ?? []) {
    const m = med.trim().toLowerCase();
    if (m.length >= 4 && blob.includes(m)) hits.push("medication");
  }
  for (const sup of state.profile?.supplements ?? []) {
    const s = sup.trim().toLowerCase();
    if (s.length >= 4 && blob.includes(s)) hits.push("supplement");
  }

  for (const report of state.reports) {
    if (report.morningDate.length >= 8 && blob.includes(report.morningDate.toLowerCase())) {
      hits.push("calendar-date");
    }
    if (report.id.length >= 8 && blob.includes(report.id.toLowerCase())) hits.push("report-id");
    if (report.createdAt && blob.includes(report.createdAt.toLowerCase())) hits.push("timestamp");
    for (const slice of distinctiveSlices(report.dream?.text ?? "")) {
      if (blob.includes(slice)) hits.push("dream");
    }
    for (const slice of distinctiveSlices(report.supplementNote ?? "")) {
      if (blob.includes(slice)) hits.push("supplement");
    }
  }

  for (const session of state.sessions) {
    if (session.id.length >= 8 && blob.includes(session.id.toLowerCase())) hits.push("session-id");
    if (session.startedAt && blob.includes(session.startedAt.toLowerCase())) hits.push("session-time");
  }

  for (const msg of state.chat) {
    for (const slice of distinctiveSlices(msg.text)) {
      if (blob.includes(slice)) hits.push("chat-text");
    }
  }

  for (const slice of distinctiveSlices(state.researchNotes)) {
    if (blob.includes(slice)) hits.push("research-notes");
  }

  return [...new Set(hits)];
}

export type ValidateResult = { ok: true; value: StudyPack } | { ok: false; error: string };

const TOP_KEYS = new Set([
  "schema",
  "participantId",
  "appVersion",
  "surface",
  "demoWeek",
  "profile",
  "nights",
  "sessions",
  "chat",
]);

const PROFILE_KEYS = new Set([
  "ageBand",
  "sex",
  "struggles",
  "activity",
  "bmiBand",
  "medicationClasses",
  "supplementCount",
  "targetSleep",
  "targetWake",
]);

const NIGHT_KEYS = new Set([
  "nightIndex",
  "fellAsleepAt",
  "wokeAt",
  "durationMinutes",
  "rating",
  "drank",
  "drinkCount",
  "spins",
  "screenOffMinutes",
  "sleepLatencyMinutes",
  "wokeInNight",
  "nightWakingMinutes",
  "usedSupplement",
  "supplementKind",
  "windDownHelped",
  "hadDream",
]);

function isClock(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function extraKeys(obj: object, allowed: Set<string>): string[] {
  return Object.keys(obj).filter((k) => !allowed.has(k));
}

export function validateStudyPack(raw: unknown): ValidateResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Pack must be an object." };
  }
  const extra = extraKeys(raw, TOP_KEYS);
  if (extra.length) return { ok: false, error: `Unknown pack field: ${extra[0]}` };

  const p = raw as Record<string, unknown>;
  if (p.schema !== STUDY_SCHEMA) return { ok: false, error: "Unknown schema." };
  if (typeof p.participantId !== "string" || !UUID_RE.test(p.participantId)) {
    return { ok: false, error: "Invalid participant number." };
  }
  if (typeof p.appVersion !== "string" || p.appVersion.length > 32) {
    return { ok: false, error: "Invalid app version." };
  }
  if (p.surface !== "desktop") return { ok: false, error: "Unknown surface." };
  if (typeof p.demoWeek !== "boolean") return { ok: false, error: "demoWeek must be boolean." };

  if (!p.profile || typeof p.profile !== "object" || Array.isArray(p.profile)) {
    return { ok: false, error: "Missing profile band." };
  }
  const profileExtra = extraKeys(p.profile, PROFILE_KEYS);
  if (profileExtra.length) return { ok: false, error: `Unknown profile field: ${profileExtra[0]}` };

  const profile = p.profile as Record<string, unknown>;
  if (!AGE_BANDS.includes(profile.ageBand as AgeBand)) return { ok: false, error: "Invalid age band." };
  if (
    profile.sex !== "female" &&
    profile.sex !== "male" &&
    profile.sex !== "other" &&
    profile.sex !== "unspecified"
  ) {
    return { ok: false, error: "Invalid sex." };
  }
  if (!Array.isArray(profile.struggles) || profile.struggles.some((s) => s !== "falling" && s !== "staying")) {
    return { ok: false, error: "Invalid struggles." };
  }
  if (
    profile.activity !== "sedentary" &&
    profile.activity !== "light" &&
    profile.activity !== "moderate" &&
    profile.activity !== "high"
  ) {
    return { ok: false, error: "Invalid activity." };
  }
  if (!BMI_BANDS.includes(profile.bmiBand as BmiBand)) return { ok: false, error: "Invalid BMI band." };
  if (
    !Array.isArray(profile.medicationClasses) ||
    profile.medicationClasses.some((c) => !MED_CLASSES.includes(c as MedicationClass))
  ) {
    return { ok: false, error: "Invalid medication classes." };
  }
  if (typeof profile.supplementCount !== "number" || profile.supplementCount < 0 || profile.supplementCount > 40) {
    return { ok: false, error: "Invalid supplement count." };
  }
  if (!isClock(profile.targetSleep) || !isClock(profile.targetWake)) {
    return { ok: false, error: "Invalid target clocks." };
  }

  if (!Array.isArray(p.nights) || p.nights.length > 400) return { ok: false, error: "Invalid nights." };
  const nights: StudyNight[] = [];
  for (const row of p.nights) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { ok: false, error: "Invalid night." };
    const nightExtra = extraKeys(row, NIGHT_KEYS);
    if (nightExtra.length) return { ok: false, error: `Unknown night field: ${nightExtra[0]}` };
    const n = row as Record<string, unknown>;
    if (typeof n.nightIndex !== "number" || !isClock(n.fellAsleepAt) || !isClock(n.wokeAt)) {
      return { ok: false, error: "Invalid night clocks." };
    }
    if (typeof n.durationMinutes !== "number" || n.durationMinutes < 0 || n.durationMinutes > 24 * 60) {
      return { ok: false, error: "Invalid duration." };
    }
    if (n.rating !== 1 && n.rating !== 2 && n.rating !== 3 && n.rating !== 4 && n.rating !== 5) {
      return { ok: false, error: "Invalid rating." };
    }
    if (typeof n.drank !== "boolean" || typeof n.wokeInNight !== "boolean" || typeof n.usedSupplement !== "boolean") {
      return { ok: false, error: "Invalid night flags." };
    }
    if (typeof n.hadDream !== "boolean") return { ok: false, error: "Invalid dream flag." };
    nights.push(n as unknown as StudyNight);
  }

  if (!p.sessions || typeof p.sessions !== "object" || Array.isArray(p.sessions)) {
    return { ok: false, error: "Invalid sessions." };
  }
  const sessions = p.sessions as Record<string, unknown>;
  if (extraKeys(sessions, new Set(["meditation", "soundscape", "completed"])).length) {
    return { ok: false, error: "Unknown sessions field." };
  }
  if (
    typeof sessions.meditation !== "number" ||
    typeof sessions.soundscape !== "number" ||
    typeof sessions.completed !== "number"
  ) {
    return { ok: false, error: "Invalid session counts." };
  }

  if (!p.chat || typeof p.chat !== "object" || Array.isArray(p.chat)) {
    return { ok: false, error: "Invalid chat summary." };
  }
  const chat = p.chat as Record<string, unknown>;
  if (extraKeys(chat, new Set(["turns", "topics"])).length) return { ok: false, error: "Unknown chat field." };
  if (typeof chat.turns !== "number" || chat.turns < 0 || chat.turns > 500) {
    return { ok: false, error: "Invalid chat turns." };
  }
  if (!Array.isArray(chat.topics) || chat.topics.some((t) => typeof t !== "string" || t.length > 64)) {
    return { ok: false, error: "Invalid chat topics." };
  }

  return {
    ok: true,
    value: {
      schema: STUDY_SCHEMA,
      participantId: p.participantId,
      appVersion: p.appVersion,
      surface: "desktop",
      demoWeek: p.demoWeek,
      profile: {
        ageBand: profile.ageBand as AgeBand,
        sex: profile.sex as StudyPack["profile"]["sex"],
        struggles: profile.struggles as StudyPack["profile"]["struggles"],
        activity: profile.activity as StudyPack["profile"]["activity"],
        bmiBand: profile.bmiBand as BmiBand,
        medicationClasses: profile.medicationClasses as MedicationClass[],
        supplementCount: profile.supplementCount as number,
        targetSleep: profile.targetSleep as string,
        targetWake: profile.targetWake as string,
      },
      nights,
      sessions: {
        meditation: sessions.meditation as number,
        soundscape: sessions.soundscape as number,
        completed: sessions.completed as number,
      },
      chat: {
        turns: chat.turns as number,
        topics: chat.topics as string[],
      },
    },
  };
}
