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
import { DELETE, GET, POST } from "@/app/api/session-key/route";

function localRequest(url: string, init?: RequestInit): Request {
  return new Request(url, {
    ...init,
    headers: { origin: "http://127.0.0.1:43147", ...(init?.headers ?? {}) },
  });
}

const MASTER = bytesToBase64(new Uint8Array(32));

describe("session-key route", () => {
  afterEach(() => {
    store.clear();
    vi.unstubAllEnvs();
  });

  it("stores and returns a 32-byte master for a local request", async () => {
    const posted = await POST(
      localRequest("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        body: JSON.stringify({ login: "email:ada@example.com", master: MASTER }),
      }),
    );
    expect(posted.status).toBe(200);
    const got = await GET(
      localRequest("http://127.0.0.1:43147/api/session-key?login=email%3Aada%40example.com"),
    );
    expect(got.status).toBe(200);
    const body = (await got.json()) as { master?: string };
    expect(body.master).toBe(MASTER);
  });

  it("404s on the operator surface", async () => {
    vi.stubEnv("CIRCADIA_SURFACE", "mod");
    const posted = await POST(
      localRequest("http://127.0.0.1:43149/api/session-key", {
        method: "POST",
        body: JSON.stringify({ login: "email:ada@example.com", master: MASTER }),
      }),
    );
    expect(posted.status).toBe(404);
  });

  it("404s a cross-site request", async () => {
    const posted = await POST(
      new Request("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: JSON.stringify({ login: "email:ada@example.com", master: MASTER }),
      }),
    );
    expect(posted.status).toBe(404);
    expect(store.size).toBe(0);
  });

  it("deletes the key on logout", async () => {
    await POST(
      localRequest("http://127.0.0.1:43147/api/session-key", {
        method: "POST",
        body: JSON.stringify({ login: "email:ada@example.com", master: MASTER }),
      }),
    );
    const gone = await DELETE(
      localRequest("http://127.0.0.1:43147/api/session-key?login=email%3Aada%40example.com"),
    );
    expect(gone.status).toBe(200);
    const got = await GET(
      localRequest("http://127.0.0.1:43147/api/session-key?login=email%3Aada%40example.com"),
    );
    expect(got.status).toBe(404);
  });
});
