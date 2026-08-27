export type Sex = "female" | "male" | "other" | "unspecified";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "high";

export type Struggle = "falling" | "staying";

export type Units = "imperial" | "metric";

export type SleepRating = 1 | 2 | 3 | 4 | 5;

export type SupplementKind = "melatonin" | "magnesium" | "both" | "other";

export type ScreenOffMinutes = 0 | 15 | 30 | 45 | 60;

export type LatencyBucket = 5 | 15 | 30 | 50 | 75;

export type WindDownHelp = "yes" | "a_bit" | "no" | "did_not_use";

export type NightWakingDuration = 0 | 10 | 25 | 45 | 70;

export type SoundscapeId = "brown" | "pink" | "rain" | "ocean";

export type MeditationId = "478" | "body-scan" | "pmr";

export type Profile = {
  name: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  medications: string[];
  supplements: string[];
  struggles: Struggle[];
  targetSleep: string;
  targetWake: string;
  units: Units;
  notificationsEnabled: boolean;
  onboardingComplete: boolean;
};

export type DreamReport = {
  text: string;
  wantMeaning: boolean;
};

export type MorningReport = {
  id: string;
  /** Calendar date of the morning you filled this in, YYYY-MM-DD */
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
  windDownHelped: WindDownHelp;
  dream?: DreamReport;
  createdAt: string;
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

export type CircadiaState = {
  profile: Profile | null;
  reports: MorningReport[];
  sessions: WindDownSession[];
  chat: ChatMessage[];
  researchNotes: string;
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
