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

export function formatCountdown(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
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

export function circularMeanMinutes(clocks: string[]): number {
  if (clocks.length === 0) return 0;
  const angles = clocks.map((c) => (clockToMinutes(c) / (24 * 60)) * 2 * Math.PI);
  const sin = mean(angles.map(Math.sin));
  const cos = mean(angles.map(Math.cos));
  let angle = Math.atan2(sin, cos);
  if (angle < 0) angle += 2 * Math.PI;
  return (angle / (2 * Math.PI)) * 24 * 60;
}

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
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function sleepNeedHours(age: number): { min: number; max: number; label: string } {
  if (age < 18) return { min: 8, max: 10, label: "8–10 hours (teen)" };
  if (age <= 25) return { min: 7, max: 9, label: "7–9 hours (young adult)" };
  if (age <= 64) return { min: 7, max: 9, label: "7–9 hours (adult)" };
  return { min: 7, max: 8, label: "7–8 hours (older adult)" };
}
