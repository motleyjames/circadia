export const SLEEP_TARGET_OPTIONS = [
  "21:00",
  "21:30",
  "22:00",
  "22:30",
  "23:00",
  "23:30",
  "00:00",
  "00:30",
  "01:00",
] as const;

export const WAKE_TARGET_OPTIONS = [
  "05:30",
  "06:00",
  "06:30",
  "07:00",
  "07:30",
  "08:00",
  "08:30",
  "09:00",
] as const;

export function isClock(value: unknown): value is string {
  return typeof value === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeClock(value: string): string {
  const [h, m] = value.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}
