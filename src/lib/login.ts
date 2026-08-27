import { isEmail, isPhone, normalizeEmail, normalizePhone } from "@/lib/contact";

/** Vault key for a diary that was never given an email or phone. */
export const LOCAL_FILE_KEY = "local:this-computer";

export const AUTH_ERRORS = {
  name: "Enter a first and last name.",
  contact: "Use an email or a phone number.",
  exists: "A file already exists for that on this computer. Log in instead.",
  missing: "No file for that on this computer.",
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
 * NEW: this is a key into this computer's vault, not a password and not a way to message anyone.
 */
export function loginKeyFromInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (isEmail(trimmed)) return `email:${normalizeEmail(trimmed)}`;
  if (isPhone(trimmed)) return `phone:${normalizePhone(trimmed).replace(/\D/g, "")}`;
  return null;
}

export function loginKeyFromProfile(profile: { email?: string; phone?: string } | null | undefined): string | null {
  if (!profile) return null;
  if (profile.email && isEmail(profile.email)) return loginKeyFromInput(profile.email);
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

export function sessionAllowsLogout(login: string | null): boolean {
  return Boolean(login && login !== LOCAL_FILE_KEY);
}
