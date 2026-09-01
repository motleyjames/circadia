import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeLockedDiary } from "@/lib/diary-pack";
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

describe("fold-inbox route", () => {
  const root = join(tmpdir(), `circadia-fold-inbox-${process.pid}`);
  const inbox = join(root, "fold-inbox.circadia");
  const downloads = join(root, "circadia-locked.circadia");

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  async function load() {
    mkdirSync(root, { recursive: true });
    vi.stubEnv("CIRCADIA_FOLD_INBOX_FILE", inbox);
    vi.stubEnv("CIRCADIA_LOCKED_DIARY_FILE", downloads);
    const { GET, POST } = await import("@/app/api/fold-inbox/route");
    return { GET, POST };
  }

  const pack = serializeLockedDiary({
    v: 1,
    files: { "email:ada@example.com": { enc: true, v: 1, iv: "YQ==", ct: "Yg==" } },
    locks: {},
    session: "email:ada@example.com",
  });

  it("returns the inbox vault, then Downloads, and 404s a remote origin", async () => {
    const { GET } = await load();
    writeFileSync(inbox, JSON.stringify(pack));
    const fromInbox = await GET(makeRequest("http://127.0.0.1:43147/api/fold-inbox"));
    expect(fromInbox.status).toBe(200);
    expect(fromInbox.headers.get("cache-control")).toBe("no-store");
    const inboxBody = (await fromInbox.json()) as {
      source: string;
      vault: { session: string | null; files: Record<string, unknown> };
    };
    expect(inboxBody.source).toBe("inbox");
    expect(inboxBody.vault.session).toBeNull();
    expect(inboxBody.vault.files["email:ada@example.com"]).toBeTruthy();

    rmSync(inbox, { force: true });
    writeFileSync(downloads, JSON.stringify(pack));
    const fromDownloads = await GET(makeRequest("http://127.0.0.1:43147/api/fold-inbox"));
    const downloadBody = (await fromDownloads.json()) as { source: string };
    expect(downloadBody.source).toBe("downloads");

    const remote = await GET(
      makeRequest("http://127.0.0.1:43147/api/fold-inbox", { origin: "https://evil.example" }),
    );
    expect(remote.status).toBe(404);
  });

  it("returns an empty payload when neither file exists", async () => {
    const { GET } = await load();
    const res = await GET(makeRequest("http://127.0.0.1:43147/api/fold-inbox"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, source: null, digest: null, vault: null });
  });

  it("drops hostile JSON", async () => {
    const { GET } = await load();
    writeFileSync(inbox, JSON.stringify({ nights: 3 }));
    const res = await GET(makeRequest("http://127.0.0.1:43147/api/fold-inbox"));
    expect(await res.json()).toEqual({ ok: true, source: null, digest: null, vault: null });
  });

  it("consumes the inbox file and never deletes Downloads", async () => {
    const { POST } = await load();
    writeFileSync(inbox, JSON.stringify(pack));
    writeFileSync(downloads, JSON.stringify(pack));
    const skipped = await POST(
      makeRequest("http://127.0.0.1:43147/api/fold-inbox", {
        method: "POST",
        body: JSON.stringify({ source: "downloads" }),
      }),
    );
    expect(await skipped.json()).toEqual({ ok: true, consumed: false });
    expect(existsSync(inbox)).toBe(true);
    expect(existsSync(downloads)).toBe(true);

    const consumed = await POST(
      makeRequest("http://127.0.0.1:43147/api/fold-inbox", {
        method: "POST",
        body: JSON.stringify({ source: "inbox" }),
      }),
    );
    expect(await consumed.json()).toEqual({ ok: true, consumed: true });
    expect(existsSync(inbox)).toBe(false);
    expect(existsSync(downloads)).toBe(true);
  });

  it("404s a missing header once the launch token is set", async () => {
    vi.stubEnv("CIRCADIA_SESSION_TOKEN", TOKEN);
    const { GET, POST } = await load();
    const missing = await GET(makeRequest("http://127.0.0.1:43147/api/fold-inbox"));
    expect(missing.status).toBe(404);
    const allowed = await GET(makeRequest("http://127.0.0.1:43147/api/fold-inbox", { token: TOKEN }));
    expect(allowed.status).toBe(200);
    const postMissing = await POST(
      makeRequest("http://127.0.0.1:43147/api/fold-inbox", {
        method: "POST",
        body: JSON.stringify({ source: "inbox" }),
      }),
    );
    expect(postMissing.status).toBe(404);
  });

  it("404s on the Operator surface", async () => {
    vi.stubEnv("CIRCADIA_SURFACE", "mod");
    const { GET } = await load();
    const res = await GET(makeRequest("http://127.0.0.1:43147/api/fold-inbox"));
    expect(res.status).toBe(404);
  });
});
