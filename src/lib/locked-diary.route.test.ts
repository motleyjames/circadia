import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeLockedDiary } from "@/lib/diary-pack";
import { SESSION_HEADER } from "@/lib/session-token-shared";

vi.mock("@/lib/surface", () => ({
  isOperatorSurface: () => false,
}));

import { POST } from "@/app/api/locked-diary/route";

const TOKEN = "test-launch-token";

function makeRequest(init: RequestInit & { origin?: string | null; token?: string } = {}): Request {
  const { origin = "http://127.0.0.1:43147", token, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (origin !== null) headers.set("origin", origin);
  if (token) headers.set(SESSION_HEADER, token);
  return new Request("http://127.0.0.1:43147/api/locked-diary", { method: "POST", ...rest, headers });
}

describe("locked-diary route", () => {
  const dest = join(tmpdir(), `circadia-locked-${process.pid}.circadia`);

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dest, { force: true });
  });

  it("writes a locked copy to the dest path and 404s a remote origin", async () => {
    vi.stubEnv("CIRCADIA_LOCKED_DIARY_FILE", dest);
    const pack = serializeLockedDiary({
      v: 1,
      files: { "email:ada@example.com": { enc: true } },
      locks: {},
      session: "email:ada@example.com",
    });
    const ok = await POST(
      makeRequest({
        body: JSON.stringify(pack),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { ok: boolean; name: string };
    expect(body.ok).toBe(true);
    expect(body.name).toBe(`circadia-locked-${process.pid}.circadia`);
    const saved = JSON.parse(readFileSync(dest, "utf8")) as { vault: { session: string | null } };
    expect(saved.vault.session).toBeNull();

    const remote = await POST(
      makeRequest({
        origin: "https://evil.example",
        body: JSON.stringify(pack),
      }),
    );
    expect(remote.status).toBe(404);
  });

  it("404s a missing header once the launch token is set", async () => {
    vi.stubEnv("CIRCADIA_LOCKED_DIARY_FILE", dest);
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    const pack = serializeLockedDiary({
      v: 1,
      files: { "email:ada@example.com": { enc: true } },
      locks: {},
      session: null,
    });
    const missing = await POST(makeRequest({ body: JSON.stringify(pack) }));
    expect(missing.status).toBe(404);
    const allowed = await POST(makeRequest({ token: TOKEN, body: JSON.stringify(pack) }));
    expect(allowed.status).toBe(200);
  });

  it("rejects random JSON", async () => {
    vi.stubEnv("CIRCADIA_LOCKED_DIARY_FILE", dest);
    const bad = await POST(makeRequest({ body: JSON.stringify({ nights: 3 }) }));
    expect(bad.status).toBe(400);
  });
});
