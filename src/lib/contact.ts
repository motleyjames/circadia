const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ANGLE_EMAIL_RE = /<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/;
const BARE_EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 120);
}

export function normalizePhone(raw: string): string {
  return raw.trim().slice(0, 32);
}

/** Strip punctuation. Treat a leading US country code as the same number. */
export function phoneDigits(raw: string): string {
  let digits = normalizePhone(raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

export function extractEmail(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const angled = trimmed.match(ANGLE_EMAIL_RE);
  if (angled && isEmail(angled[1])) return normalizeEmail(angled[1]);
  if (isEmail(trimmed)) return normalizeEmail(trimmed);
  const bare = trimmed.match(BARE_EMAIL_RE);
  if (bare && isEmail(bare[0])) return normalizeEmail(bare[0]);
  return null;
}

export function isEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return EMAIL_RE.test(email) && email.length >= 6 && email.length <= 120;
}

export function isPhone(value: string): boolean {
  const digits = phoneDigits(value);
  return digits.length >= 7 && digits.length <= 15;
}

export function hasContact(email: string, phone: string): boolean {
  return isEmail(email) || isPhone(phone);
}

export function contactOrNull(email: string, phone: string): { email: string | null; phone: string | null } {
  const e = extractEmail(email) ?? (isEmail(email) ? normalizeEmail(email) : null);
  const p = isPhone(phone) ? phoneDigits(phone) : null;
  return {
    email: e,
    phone: p,
  };
}
