import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { listen } = createRequire(import.meta.url)("../../electron/static-server.cjs") as {
  listen: (options: { root: string; inbox: string; port?: number }) => Promise<{
    server: { close: () => void };
    url: string;
  }>;
};

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(full, out);
    else out.push(full);
  }
  return out;
}

describe("static server", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "circadia-ui-"));
  fs.writeFileSync(path.join(tmp, "index.html"), "<h1>Circadia</h1>");
  fs.writeFileSync(path.join(tmp, "you.html"), "<h1>You</h1>");
  const inbox = path.join(tmp, "inbox");

  let server: { close: () => void } | undefined;
  let url = "";

  it("serves the diary and stores a stripped pack", async () => {
    const started = await listen({ root: tmp, inbox, port: 0 });
    server = started.server;
    url = started.url;

    const home = await fetch(`${url}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("Circadia");

    const you = await fetch(`${url}/you`);
    expect(you.status).toBe(200);
    expect(await you.text()).toContain("You");

    const probe = await fetch(`${url}/api/study`);
    expect(probe.status).toBe(200);
    expect(await probe.json()).toEqual({ ok: true, inbox: true });
    expect(fs.existsSync(inbox)).toBe(false);

    const missingVoice = await fetch(`${url}/voice/missing.wav`);
    expect(missingVoice.status).toBe(404);

    const ok = await fetch(`${url}/api/study`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schema: "circadia-study-v1", participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }),
    });
    expect((await ok.json()).ok).toBe(true);
    expect(fs.readdirSync(inbox).length).toBe(1);

    const blocked = await fetch(`${url}/api/study`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schema: "circadia-study-v1", name: "James" }),
    });
    expect(blocked.status).toBe(400);

    const roster = await fetch(`${url}/api/study`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schema: "circadia-roster-v1",
        participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        name: "James",
      }),
    });
    expect((await roster.json()).ok).toBe(true);
    expect(fs.readdirSync(inbox).length).toBe(2);
  });

  afterAll(() => {
    server?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

/**
 * Security regressions. Each of these was a live hole in 0.8.22, found by an
 * audit of the shipped Mac server. They are cheap to re-open by accident.
 */
describe("static server refuses hostile requests", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "circadia-sec-"));
  const root = path.join(tmp, "root");
  // Deep enough that a `../..` escape has somewhere to land.
  const inbox = path.join(tmp, "data", "app", "study-inbox");
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(root, "index.html"), "<h1>Circadia</h1>");
  fs.writeFileSync(path.join(tmp, "outside-secret.txt"), "not for the web");

  let server: { close: () => void } | undefined;
  let url = "";

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${url}/api/study`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("keeps a hostile participant number inside the inbox", async () => {
    const started = await listen({ root, inbox, port: 0 });
    server = started.server;
    url = started.url;

    for (const participantId of ["../../../PWNED", "../ESCAPE", "../../UP", "..%2f..%2fX", "/etc/x"]) {
      await post({ schema: "circadia-roster-v1", participantId, note: "attacker" });
    }
    // `slice(0, 8)` alone let `../../..` through and wrote packs above the inbox.
    const written = filesUnder(path.join(tmp, "data"));
    expect(written.length).toBeGreaterThan(0);
    for (const file of written) {
      expect(path.dirname(file)).toBe(inbox);
    }
    // A rejected id still stores the pack — under a safe name, not a path.
    for (const file of written) {
      expect(path.basename(file).startsWith("unknown-")).toBe(true);
    }
  });

  it("refuses a POST from another site", async () => {
    const blocked = await post(
      { schema: "circadia-fault-v1", participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
      { origin: "https://evil.example" },
    );
    expect(blocked.status).toBe(403);

    const sameOrigin = await post(
      { schema: "circadia-fault-v1", participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
      { origin: url },
    );
    expect(sameOrigin.status).toBe(200);
  });

  it("survives a malformed URL instead of taking the app down", async () => {
    // `GET /%` threw URIError out of the request handler and ended the process.
    for (const bad of ["/%", "/%zz", "/%E0%A4%A", "/%2e%2e%2f%2e%2e%2fetc%2fpasswd"]) {
      const res = await fetch(url + bad);
      expect([200, 404]).toContain(res.status);
    }
    const alive = await fetch(`${url}/`);
    expect(alive.status).toBe(200);
  });

  it("never serves a file outside the root, symlink or not", async () => {
    const traversal = await fetch(`${url}/../../outside-secret.txt`);
    expect(await traversal.text()).not.toContain("not for the web");

    let linked = false;
    try {
      fs.symlinkSync(path.join(tmp, "outside-secret.txt"), path.join(root, "leak.txt"));
      linked = true;
    } catch {
      /* no symlink permission on this machine — the lexical check still stands */
    }
    if (linked) {
      const leak = await fetch(`${url}/leak.txt`);
      expect(await leak.text()).not.toContain("not for the web");
    }
  });

  it("sets the headers that keep another page from driving the diary", async () => {
    const res = await fetch(`${url}/`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("writes stored packs owner-only", async () => {
    await post({ schema: "circadia-study-v1", participantId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
    const stored = filesUnder(inbox);
    expect(stored.length).toBeGreaterThan(0);
    if (process.platform !== "win32") {
      expect(fs.statSync(stored[0]!).mode & 0o077).toBe(0);
    }
  });

  afterAll(() => {
    server?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
