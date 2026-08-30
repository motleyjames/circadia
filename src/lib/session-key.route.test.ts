import { afterEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@/lib/keychain", () => ({
  KEYCHAIN_SERVICE: "Circadia",
  keychain: {
    set: (account: string, password: string) => {
      store.set(account, password);
      return true;
    },
    get: (account: string) => store.get(account) ?? null,
    delete: (account: string) => store.delete(account),
  },
}));

import { bytesToBase64 } from "@/lib/password";
import { SESSION_HEADER } from "@/lib/session-token-shared";
import { DELETE, GET, POST } from "@/app/api/session-key/route";

const MASTER = bytesToBase64(new Uint8Array(32));
const TOKEN = "test-launch-token";
const LOGIN = "email:ada@example.com";

function makeRequest(
  url: string,
  init: RequestInit & { origin?: string | null; token?: string } = {},
): Request {
  const { origin = "http://127.0.0.1:43147", token, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (origin !== null) headers.set("origin", origin);
  if (token) headers.set(SESSION_HEADER, token);
  return new Request(url, { ...rest, headers });
}

function authed(url: string, init: RequestInit & { origin?: string | null } = {}): Request {
  return makeRequest(url, { ...init, token: TOKEN });
}

describe("session-key route", () => {
  afterEach(() => {
    store.clear();
    vi.unstubAllEnvs();
  });

  it("404s when CIRCADIA_SESSION_TOKEN is unset", async () => {
    const posted = await POST(
      makeRequest("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        token: "anything",
        body: JSON.stringify({ login: LOGIN, master: MASTER }),
      }),
    );
    expect(posted.status).toBe(404);
    expect(store.size).toBe(0);
  });

  it("404s a local request with no header once the env is set", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    const posted = await POST(
      makeRequest("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        body: JSON.stringify({ login: LOGIN, master: MASTER }),
      }),
    );
    expect(posted.status).toBe(404);
    expect(store.size).toBe(0);
  });

  it("404s a wrong header", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    const posted = await POST(
      makeRequest("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        token: "not-the-launch-token",
        body: JSON.stringify({ login: LOGIN, master: MASTER }),
      }),
    );
    expect(posted.status).toBe(404);
    expect(store.size).toBe(0);
  });

  it("stores and returns a 32-byte master when the header matches", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    const posted = await POST(
      authed("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        body: JSON.stringify({ login: LOGIN, master: MASTER }),
      }),
    );
    expect(posted.status).toBe(200);
    const got = await GET(authed(`http://127.0.0.1:43147/api/session-key?login=${encodeURIComponent(LOGIN)}`));
    expect(got.status).toBe(200);
    const body = (await got.json()) as { master?: string };
    expect(body.master).toBe(MASTER);
  });

  it("allows a matching token when Origin is absent", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    const posted = await POST(
      authed("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        origin: null,
        body: JSON.stringify({ login: LOGIN, master: MASTER }),
      }),
    );
    expect(posted.status).toBe(200);
  });

  it("404s on the operator surface even with a matching token", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    vi.stubEnv("CIRCADIA_SURFACE", "mod");
    const posted = await POST(
      authed("http://127.0.0.1:43149/api/session-key", {
        method: "POST",
        body: JSON.stringify({ login: LOGIN, master: MASTER }),
      }),
    );
    expect(posted.status).toBe(404);
  });

  it("404s a cross-site request even with a matching token", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    const posted = await POST(
      authed("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        origin: "https://evil.example",
        body: JSON.stringify({ login: LOGIN, master: MASTER }),
      }),
    );
    expect(posted.status).toBe(404);
    expect(store.size).toBe(0);
  });

  it("deletes the key on logout", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    await POST(
      authed("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        body: JSON.stringify({ login: LOGIN, master: MASTER }),
      }),
    );
    const gone = await DELETE(
      authed(`http://127.0.0.1:43147/api/session-key?login=${encodeURIComponent(LOGIN)}`),
    );
    expect(gone.status).toBe(200);
    const got = await GET(authed(`http://127.0.0.1:43147/api/session-key?login=${encodeURIComponent(LOGIN)}`));
    expect(got.status).toBe(404);
  });
});
