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
