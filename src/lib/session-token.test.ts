import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_HEADER, sessionTokenOk } from "./session-token";

const TOKEN = "launch-token-one";

function req(token?: string): Request {
  const headers = new Headers();
  if (token) headers.set(SESSION_HEADER, token);
  return new Request("http://127.0.0.1:43148/api/session-key", { headers });
}

describe("sessionTokenOk", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed for session-key when the env is unset", () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", "");
    expect(sessionTokenOk(req("anything"), true)).toBe(false);
    expect(sessionTokenOk(req(), true)).toBe(false);
  });

  it("skips the vault check when the env is unset", () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", "");
    expect(sessionTokenOk(req(), false)).toBe(true);
    expect(sessionTokenOk(req("stale"), false)).toBe(true);
  });

  it("accepts only the matching header when the env is set", () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    expect(sessionTokenOk(req(), true)).toBe(false);
    expect(sessionTokenOk(req(), false)).toBe(false);
    expect(sessionTokenOk(req("wrong-token-one"), true)).toBe(false);
    expect(sessionTokenOk(req("wrong"), false)).toBe(false);
    expect(sessionTokenOk(req(TOKEN), true)).toBe(true);
    expect(sessionTokenOk(req(TOKEN), false)).toBe(true);
  });
});
