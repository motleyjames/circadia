import type { Episode } from "@/lib/episode";

export type Sex = "female" | "male" | "other" | "unspecified";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "high";

export type Struggle = "falling" | "staying";

export type Units = "imperial" | "metric";

/** Index 0 = Sunday. Length is always 7. */
export type ScheduledDays = [boolean, boolean, boolean, boolean, boolean, boolean, boolean];

export type SleepRating = 1 | 2 | 3 | 4 | 5;

export type SupplementKind = "melatonin" | "magnesium" | "both" | "antihistamine" | "other";

export type ScreenOffMinutes = 0 | 15 | 30 | 45 | 60;

export type LatencyBucket = 5 | 10 | 15 | 20 | 30 | 45 | 50 | 60 | 75 | 90 | 120 | 180;

export type WindDownHelp = "yes" | "a_bit" | "no" | "did_not_use";

export type NightWakingDuration = 0 | 5 | 10 | 15 | 20 | 25 | 30 | 45 | 50 | 60 | 70 | 75 | 90 | 120 | 180;

/** How many separate awakenings, not counting the final one. 4 means "four or more". */
export type AwakeningCount = 0 | 1 | 2 | 3 | 4;

/** Yesterday's daytime sleep. Naps change sleep pressure, so a night cannot be read without them. */
export type NapMinutes = 0 | 20 | 45 | 90;

export type SoundscapeId = "brown" | "pink" | "rain" | "ocean";

export type MeditationId = "478" | "body-scan" | "pmr";

export type Profile = {
  firstName: string;
  lastName: string;
  /** Display name on this computer. Never shown in Operator. */
  name: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  /** Local login identifier. Never copied into a night pack. Not a channel to the tester. */
  email: string;
  /** Local login identifier. Never copied into a night pack. Not a channel to the tester. */
  phone: string;
  medications: string[];
  supplements: string[];
  struggles: Struggle[];
  targetSleep: string;
  targetWake: string;
  units: Units;
  notificationsEnabled: boolean;
  onboardingComplete: boolean;
  /**
   * Mornings the person has to get up for something.
   * Index 0 = Sunday … 6 = Saturday. Not inferred from weekday.
   */
  scheduledDays: ScheduledDays;
};

export type DreamReport = {
  text: string;
  wantMeaning: boolean;
};

export type MorningReport = {
  id: string;
  /** Calendar date of the morning this page belongs to, YYYY-MM-DD. Unique. */
  morningDate: string;
  wokeAt: string;
  fellAsleepAt: string;
  rating: SleepRating;
  drank: boolean;
  drinkCount?: number;
  spins?: boolean;
  screenOffMinutes: ScreenOffMinutes;
  sleepLatencyMinutes: LatencyBucket;
  wokeInNight: boolean;
  nightWakingMinutes: NightWakingDuration;
  usedSupplement: boolean;
  supplementKind?: SupplementKind;
  /** Local only. Never copied into a study pack. */
  supplementNote?: string;
  windDownHelped: WindDownHelp;
  dream?: DreamReport;
  createdAt: string;
  /**
   * The user chose a past date. Stored, never derived from createdAt vs morningDate —
   * filing at 00:30 for last night is late by civil date but not by intent.
   */
  filedLate?: boolean;

  /**
   * Consensus Sleep Diary fields (Carney et al., Sleep 2012). All optional: nights
   * filed before these existed keep working, and anything derived from them returns
   * null rather than a guess. See claude/sleep-data-spec-1.0.md in the project.
   *
   * `wokeAt` is the FINAL awakening. `outOfBedAt` is when they actually got up —
   * the gap between them is terminal wakefulness, and without it there is no
   * denominator for sleep efficiency.
   */
  inBedAt?: string;
  /** Lights out — when they started trying, which is often later than getting in. */
  triedToSleepAt?: string;
  outOfBedAt?: string;
  awakeningCount?: AwakeningCount;
  napMinutes?: NapMinutes;
  caffeineAfter2pm?: boolean;
  latencyFloor?: boolean;
  wakingFloor?: boolean;
  morningSeconds?: number;
};

export type WindDownSession = {
  id: string;
  startedAt: string;
  kind: "meditation" | "soundscape";
  meditationId?: MeditationId;
  soundscapeId?: SoundscapeId;
  durationSeconds: number;
  completed: boolean;
};

export type ChatRole = "you" | "circadia";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  citations?: string[];
};

/** One filed consult. The live desk is `chat` + `activeConsultId`. */
export type ConsultThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type StudyStatus = "sent" | "error" | "blocked" | "held";

export type StudyState = {
  asked: boolean;
  consented: boolean;
  /** Local UUID. Stitches nights if they pause. Not a name. */
  participantId: string | null;
  lastSentAt: string | null;
  lastStatus: StudyStatus | null;
  lastError: string | null;
  /** When the roster card last reached the inbox. */
  rosterSentAt: string | null;
  /** Normalized invite. Vault ciphertext only. Never a pack field. */
  inviteNormalized?: string | null;
  inviteVersion?: 1 | 2 | null;
  packEtag?: string | null;
  sendPending?: boolean;
  withdrawnAt?: string | null;
  /** SHA-256 of the last payload the Worker accepted. Vault only. */
  lastSentPackHash?: string | null;
  /** Promises this device accepted. Vault only. Never a pack field. */
  consentVersion?: number | null;
  consentedAt?: string | null;
};

export type CircadiaState = {
  profile: Profile | null;
  reports: MorningReport[];
  sessions: WindDownSession[];
  /** Live desk. Empty after hydrate — yesterday's thread is in consultHistory. */
  chat: ChatMessage[];
  /** Which history row the live desk is continuing. Null = a new consult. */
  activeConsultId: string | null;
  consultHistory: ConsultThread[];
  researchNotes: string;
  demoWeek: boolean;
  study: StudyState;
  /**
   * Clinical course of care. Null is solo mode — every diary today.
   * Never synthesised from nights or from study.consented.
   */
  episode: Episode | null;
  /** In-flight morning interview. Not a report. Null when nothing is mid-file. */
  morningDraft: MorningDraft | null;
  /** In-flight sleep intake (onboarding). Not a report. */
  intakeDraft: IntakeDraft | null;
  /**
   * Allowlisted referral flags only. Crisis and mania are never stored here.
   * Category and episodeNight — no text.
   */
  safetyFlags: SafetyFlag[];
};

export type MorningDraft = {
  morningDate: string;
  step: number;
  wokeAt?: string;
  outOfBedAt?: string;
  inBedAt?: string;
  lightsOutSame?: boolean;
  triedToSleepAt?: string;
  getUpDelay?: number;
  awakeningCount?: AwakeningCount;
  napMinutes?: NapMinutes;
  rating?: SleepRating;
  drank?: boolean;
  drinkCount?: number;
  spins?: boolean;
  screenOffMinutes?: ScreenOffMinutes;
  sleepLatencyMinutes?: LatencyBucket;
  wokeInNight?: boolean;
  nightWakingMinutes?: NightWakingDuration;
  usedSupplement?: boolean;
  supplementKind?: SupplementKind;
  supplementNote?: string;
  windDownHelped?: WindDownHelp;
  includeDream?: boolean;
  dreamText?: string;
  wantMeaning?: boolean;
  caffeineAfter2pm?: boolean;
  latencyFloor?: boolean;
  wakingFloor?: boolean;
  morningStartedAt?: number;
};

export type IntakeProblem = "falling" | "staying" | "both";
export type IntakePhase = "earlier" | "neither" | "later";

export type IntakeDraft = {
  step: number;
  age?: string;
  feet?: string;
  inches?: string;
  pounds?: string;
  problem?: IntakeProblem;
  phase?: IntakePhase;
  wakeTime?: string;
  stimulant?: string;
  scheduledDays?: ScheduledDays;
};

export type AgeBand = "13-17" | "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+";

export type BmiBand = "unconfirmed" | "underweight" | "healthy" | "overweight" | "obesity-1" | "obesity-2";

export type MedicationClass =
  | "stimulant"
  | "bupropion"
  | "antidepressant"
  | "steroid"
  | "decongestant"
  | "beta-blocker"
  | "antihistamine"
  | "other";

export type StudyNight = {
  nightIndex: number;
  fellAsleepAt: string;
  wokeAt: string;
  durationMinutes: number;
  rating: SleepRating;
  drank: boolean;
  drinkCount?: number;
  spins?: boolean;
  screenOffMinutes?: ScreenOffMinutes;
  sleepLatencyMinutes: LatencyBucket;
  wokeInNight: boolean;
  nightWakingMinutes: NightWakingDuration;
  usedSupplement: boolean;
  supplementKind?: SupplementKind;
  windDownHelped?: WindDownHelp;
  hadDream?: boolean;
  inBedAt?: string;
  triedToSleepAt?: string;
  outOfBedAt?: string;
  awakeningCount?: AwakeningCount;
  napMinutes?: NapMinutes;
  filedLate?: boolean;
  /** Position since enrollment, from 0. Absent for nights filed before joining. */
  episodeNight?: number;
  caffeineAfter2pm?: boolean;
  latencyFloor?: boolean;
  wakingFloor?: boolean;
  morningSeconds?: number;
};

export type RosterEvent = {
  schema: "circadia-roster-v1";
  at: string;
  participantId: string;
  appVersion: string;
  /** Legacy inbox files may still carry a name. New cards are v2 and omit this field. Operator never displays it. */
  name: string | null;
  /** Kept on the schema so old inbox files still parse. New cards omit it. */
  email: string | null;
  phone: string | null;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  struggles: Struggle[];
  targetSleep: string;
  targetWake: string;
};

/** Outbound roster. Bands only — no name, email, phone, age, height, or weight. */
export type RosterEventV2 = {
  schema: "circadia-roster-v2";
  at: string;
  participantId: string;
  appVersion: string;
  ageBand: AgeBand;
  bmiBand: BmiBand;
  activity: ActivityLevel;
  struggles: Struggle[];
  targetSleep: string;
  targetWake: string;
};

export type AnyRosterEvent = RosterEvent | RosterEventV2;

export type FaultEvent = {
  schema: "circadia-fault-v1";
  at: string;
  participantId: string;
  appVersion: string;
  message: string;
  stack: string | null;
  href: string | null;
};

export type StudyPack = {
  schema: "circadia-study-v1";
  participantId: string;
  appVersion: string;
  surface: "desktop";
  demoWeek: boolean;
  profile: {
    ageBand: AgeBand;
    sex: Sex;
    struggles: Struggle[];
    activity: ActivityLevel;
    bmiBand: BmiBand;
    medicationClasses: MedicationClass[];
    supplementCount: number;
    targetSleep: string;
    targetWake: string;
  };
  nights: StudyNight[];
  sessions?: {
    meditation: number;
    soundscape: number;
    completed: number;
  };
  chat?: {
    turns: number;
    topics: string[];
  };
  /** Whole nights since enrollment. Absent when there is no episode. Never a date. */
  nightsElapsed?: number;
  safetyFlags?: SafetyFlag[];
};

export type PackSafetyCategory = "witnessed-apnea" | "drowsy-driving";

export type SafetyFlag = {
  category: PackSafetyCategory;
  episodeNight: number;
};

export type NoteConfidence = "high" | "moderate" | "low";

export type SleepNote = {
  id: string;
  title: string;
  body: string;
  confidence: NoteConfidence;
  sourceIds: string[];
  kind: "alert" | "lever" | "steady" | "context";
};

export type SupplementRec = {
  id: "melatonin" | "magnesium" | "none";
  title: string;
  body: string;
  notFirstLine: string;
  confidence: NoteConfidence;
  sourceIds: string[];
};

export type RecommendationPack = {
  ready: boolean;
  nightsLogged: number;
  nightsNeeded: number;
  supplements: SupplementRec[];
  protocol: SleepNote[];
  suggestedSessions: Array<{
    kind: "meditation" | "soundscape";
    id: MeditationId | SoundscapeId;
    why: string;
  }>;
};

export type NightMetrics = {
  reportId: string;
  morningDate: string;
  durationMinutes: number;
  midpointMinutes: number;
  rating: SleepRating;
  drank: boolean;
  screenOffMinutes: number;
  sleepLatencyMinutes: number;
  wokeInNight: boolean;
};

export type WeekBreakdown = {
  nights: NightMetrics[];
  meanDurationMinutes: number;
  meanRating: number;
  meanLatencyMinutes: number;
  meanScreenOffMinutes: number;
  alcoholNights: number;
  wakeSpreadMinutes: number;
  sleepSpreadMinutes: number;
  meanMidpointMinutes: number;
  nightsWithHighLatency: number;
  nightsWokeInNight: number;
};
