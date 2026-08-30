import { timingSafeEqual } from "node:crypto";
import { SESSION_HEADER, SESSION_TOKEN_ENV } from "./session-token-shared";

export { SESSION_HEADER, SESSION_TOKEN_ENV };

function expectedToken(): string | null {
  const value = process.env[SESSION_TOKEN_ENV]?.trim();
  return value ? value : null;
}

/**
 * Session-key: `required` true — fail closed when the env is unset.
 * Vault: `required` false — check the header only when the env is set.
 */
export function sessionTokenOk(request: Request, required: boolean): boolean {
  const expected = expectedToken();
  if (!expected) return !required;
  const got = request.headers.get(SESSION_HEADER) ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
