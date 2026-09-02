/** Minutes from local midnight for an HH:MM clock time. */
export function clockToMinutes(clock: string): number {
  const [hRaw, mRaw] = clock.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return ((h % 24) * 60 + (m % 60) + 24 * 60) % (24 * 60);
}

export function minutesToClock(total: number): string {
  const normalized = ((Math.round(total) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatClock(clock: string, units: "imperial" | "metric" = "imperial"): string {
  const minutes = clockToMinutes(clock);
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (units === "metric") {
    return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Overnight duration from sleep clock to wake clock, in minutes. */
export function overnightDuration(sleepClock: string, wakeClock: string): number {
  const sleep = clockToMinutes(sleepClock);
  let wake = clockToMinutes(wakeClock);
  if (wake <= sleep) wake += 24 * 60;
  return wake - sleep;
}

export function midpointMinutes(sleepClock: string, wakeClock: string): number {
  const sleep = clockToMinutes(sleepClock);
  const duration = overnightDuration(sleepClock, wakeClock);
  return (sleep + duration / 2) % (24 * 60);
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function clockFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function dateFromIsoAndClock(isoDate: string, clock: string): Date {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const minutes = clockToMinutes(clock);
  return new Date(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

/** Screen-off time: 60 minutes before target sleep, same clock day wrapping. */
export function screenOffClock(targetSleep: string): string {
  return minutesToClock(clockToMinutes(targetSleep) - 60);
}

export function minutesUntilClock(clock: string, now = new Date()): number {
  const target = clockToMinutes(clock);
  const current = now.getHours() * 60 + now.getMinutes();
  let delta = target - current;
  if (delta < 0) delta += 24 * 60;
  return delta;
}

/** Whole seconds until an HH:MM clock, wrapping past midnight. Uses the wall clock, including seconds. */
export function secondsUntilClock(clock: string, now = new Date()): number {
  const target = clockToMinutes(clock) * 60;
  const current = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let delta = target - current;
  if (delta < 0) delta += 24 * 3600;
  return delta;
}

export function formatCountdown(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Live countdown from wall-clock seconds. `12:05` or `1:02:05`. */
export function formatCountdownHms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${m}:${ss}`;
}

/** Current time with seconds, same 12/24 convention as formatClock. */
export function formatWallClock(date: Date, units: "imperial" | "metric" = "imperial"): string {
  const h24 = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (units === "metric") {
    return `${String(h24).padStart(2, "0")}:${mm}:${ss}`;
  }
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm}:${ss} ${suffix}`;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

/** Circular standard deviation for clock times, returned in minutes. */
export function circularSpreadMinutes(clocks: string[]): number {
  if (clocks.length < 2) return 0;
  const angles = clocks.map((c) => (clockToMinutes(c) / (24 * 60)) * 2 * Math.PI);
  const sin = mean(angles.map(Math.sin));
  const cos = mean(angles.map(Math.cos));
  const R = Math.hypot(sin, cos);
  if (R <= 0) return 12 * 60;
  const circStd = Math.sqrt(-2 * Math.log(Math.min(1, R)));
  return (circStd / (2 * Math.PI)) * 24 * 60;
}

const MINUTES_PER_DAY = 24 * 60;

/** Circular mean of clock minutes on a 24h circle. Keeps fractional minutes. */
export function circularMeanOfMinutes(minutes: number[]): number {
  if (minutes.length === 0) return 0;
  const angles = minutes.map((value) => {
    const wrapped = ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return (wrapped / MINUTES_PER_DAY) * 2 * Math.PI;
  });
  const sin = mean(angles.map(Math.sin));
  const cos = mean(angles.map(Math.cos));
  let angle = Math.atan2(sin, cos);
  if (angle < 0) angle += 2 * Math.PI;
  return (angle / (2 * Math.PI)) * MINUTES_PER_DAY;
}

export function circularMeanMinutes(clocks: string[]): number {
  return circularMeanOfMinutes(clocks.map((clock) => clockToMinutes(clock)));
}

/** Intake placeholders. BMI notes must treat these as unmeasured until You is edited. */
export const DEFAULT_HEIGHT_CM = 175;
export const DEFAULT_WEIGHT_KG = 70;

export function bmiKgM(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  if (m <= 0) return 0;
  return weightKg / (m * m);
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  if (inches === 12) return { feet: feet + 1, inches: 0 };
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

export function kgToLb(kg: number): number {
  return kg * 2.2046226218;
}

export function lbToKg(lb: number): number {
  return lb / 2.2046226218;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Non-secure contexts have no randomUUID. The study validator requires a real
  // UUID, so the fallback mints a v4 rather than an `id_…` string it would reject.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * National Sleep Foundation duration bands. Intake accepts age 13, and 13 sits in
 * the school-age band (9-11 h), not the teen band — it was being told 8-10.
 */
export function sleepNeedHours(age: number): { min: number; max: number; label: string } {
  if (age <= 13) return { min: 9, max: 11, label: "Most people your age need 9–11 hours" };
  if (age < 18) return { min: 8, max: 10, label: "Most people your age need 8–10 hours" };
  if (age <= 64) return { min: 7, max: 9, label: "Most people your age need 7–9 hours" };
  return { min: 7, max: 8, label: "Most people your age need 7–8 hours" };
}

/** Midpoint of the NSF/AASM band — used to compute asleep-by from a defended wake. */
export function targetDurationMinutes(age: number): number {
  const need = sleepNeedHours(age);
  return Math.round(((need.min + need.max) / 2) * 60);
}

/** Asleep-by clock: wake minus duration, wrapping midnight. */
export function sleepFromWake(wakeClock: string, durationMinutes: number): string {
  return minutesToClock(clockToMinutes(wakeClock) - durationMinutes);
}
