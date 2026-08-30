import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vault-file", () => ({
  readDiskVault: async () => ({ v: 1, files: {}, locks: {}, session: null }),
  writeDiskVault: async () => {},
}));

import { GET, PUT } from "@/app/api/vault/route";
import { SESSION_HEADER } from "@/lib/session-token-shared";

const TOKEN = "test-launch-token";

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

describe("vault route session header", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows a local request when the env is unset, with or without a header", async () => {
    const bare = await GET(makeRequest("http://127.0.0.1:43147/api/vault"));
    expect(bare.status).toBe(200);
    const extra = await GET(makeRequest("http://127.0.0.1:43147/api/vault", { token: "stale" }));
    expect(extra.status).toBe(200);
  });

  it("404s a missing or wrong header once the env is set", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    const missing = await GET(makeRequest("http://127.0.0.1:43147/api/vault"));
    expect(missing.status).toBe(404);
    const wrong = await GET(makeRequest("http://127.0.0.1:43147/api/vault", { token: "nope" }));
    expect(wrong.status).toBe(404);
  });

  it("allows GET and PUT when the header matches", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    const got = await GET(makeRequest("http://127.0.0.1:43147/api/vault", { token: TOKEN }));
    expect(got.status).toBe(200);
    const put = await PUT(
      makeRequest("http://127.0.0.1:43147/api/vault", {
        method: "PUT",
        token: TOKEN,
        body: JSON.stringify({ v: 1, files: {}, locks: {}, session: null }),
      }),
    );
    expect(put.status).toBe(200);
  });
});
