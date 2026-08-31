import { extractEmail, isPhone, phoneDigits } from "@/lib/contact";

/** Vault key for a diary that was never given an email or phone. */
export const LOCAL_FILE_KEY = "local:this-computer";

export const AUTH_ERRORS = {
  name: "Enter a first and last name.",
  contact: "Use an email or a phone number.",
  exists: "That email or phone already has a diary on this device. Log in instead.",
  missing: "No diary for that on this device.",
  emptyDevice:
    "There's no diary on this device yet. Log in with the same email or phone this app was packed with, bring a locked copy, or sign up.",
  credentials: "Wrong password.",
  crypto: "This page could not check a password. Open the Circadia app — not a file on disk.",
  noop: "This window is not the diary. Open Circadia, not the operator.",
  orphan:
    "This device already has a diary with no login. Sign up — that attaches your email or phone. It does not start you over.",
} as const;

export function displayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, " ").trim() || "you";
}

export function splitDisplayName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1) };
}

/**
 * Filename for a local diary. Email wins if both would parse.
 * Vault key for this device. Not a way to message anyone.
 */
export function loginKeyFromInput(raw: string): string | null {
  const email = extractEmail(raw);
  if (email) return `email:${email}`;
  if (isPhone(raw)) return `phone:${phoneDigits(raw)}`;
  return null;
}

/** Same person, different typing: +1, angle-bracket emails. */
export function loginKeyCandidates(raw: string): string[] {
  const primary = loginKeyFromInput(raw);
  if (!primary) return [];
  const keys = [primary];
  if (primary.startsWith("phone:")) {
    const digits = primary.slice("phone:".length);
    if (digits.length === 10) keys.push(`phone:1${digits}`);
    if (digits.length === 11 && digits.startsWith("1")) keys.push(`phone:${digits.slice(1)}`);
  }
  return [...new Set(keys)];
}

export function loginKeyFromProfile(profile: { email?: string; phone?: string } | null | undefined): string | null {
  if (!profile) return null;
  if (profile.email && extractEmail(profile.email)) return loginKeyFromInput(profile.email);
  if (profile.phone && isPhone(profile.phone)) return loginKeyFromInput(profile.phone);
  return null;
}

export function contactFromLogin(login: string): { email: string; phone: string } {
  if (login.startsWith("email:")) return { email: login.slice("email:".length), phone: "" };
  if (login.startsWith("phone:")) return { email: "", phone: login.slice("phone:".length) };
  return { email: "", phone: "" };
}

export function formatLoginForDisplay(login: string | null): string {
  if (!login || login === LOCAL_FILE_KEY) return "";
  if (login.startsWith("email:")) return login.slice("email:".length);
  if (login.startsWith("phone:")) return login.slice("phone:".length);
  return "";
}

/** You-page / identity row. Emails stay as-is; US phones get punctuation. */
export function prettyContactDisplay(login: string | null): string {
  const raw = formatLoginForDisplay(login);
  if (!raw) return "";
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

export function sessionAllowsLogout(login: string | null): boolean {
  return Boolean(login && login !== LOCAL_FILE_KEY);
}

export type DiaryIdentity = {
  login: string;
  display: string;
  orphan: boolean;
};

export function identitiesFromVaultKeys(keys: string[]): DiaryIdentity[] {
  return keys
    .map((login) =>
      login === LOCAL_FILE_KEY
        ? { login, display: "a diary with no email or phone yet", orphan: true }
        : { login, display: formatLoginForDisplay(login) || login, orphan: false },
    )
    .sort((a, b) => Number(a.orphan) - Number(b.orphan) || a.display.localeCompare(b.display));
}

export function defaultAuthMode(identities: DiaryIdentity[]): "signup" | "login" {
  return identities.some((row) => !row.orphan) ? "login" : "signup";
}

export function defaultContactField(identities: DiaryIdentity[]): string {
  const named = identities.filter((row) => !row.orphan);
  return named.length === 1 ? named[0].display : "";
}
