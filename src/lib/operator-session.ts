const KEY = "circadia-operator-key";

export function readOperatorKey(): string {
  try {
    return sessionStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeOperatorKey(secret: string): void {
  try {
    if (secret) sessionStorage.setItem(KEY, secret);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
