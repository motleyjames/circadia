const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 120);
}

export function normalizePhone(raw: string): string {
  return raw.trim().slice(0, 24);
}

export function isEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return EMAIL_RE.test(email) && email.length >= 6 && email.length <= 120;
}

export function isPhone(value: string): boolean {
  const digits = normalizePhone(value).replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function hasContact(email: string, phone: string): boolean {
  return isEmail(email) || isPhone(phone);
}

export function contactOrNull(email: string, phone: string): { email: string | null; phone: string | null } {
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  return {
    email: isEmail(e) ? e : null,
    phone: isPhone(p) ? p : null,
  };
}
