import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  postInbox,
  resetStudyInboxProbeForTests,
  STUDY_HELD_ERROR,
  studyInboxAvailable,
} from "./study-client";
import type { InboxBody } from "./study-client";

const body = { schema: "circadia-roster-v1" } as InboxBody;

function jsonResponse(status: number, payload: unknown, contentType = "application/json") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": contentType },
  });
}

describe("study inbox client", () => {
  afterEach(() => {
    resetStudyInboxProbeForTests();
    vi.unstubAllGlobals();
  });

  it("holds the pack when the inbox route is missing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method ?? "GET").toBe("GET");
      return jsonResponse(404, { ok: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await studyInboxAvailable()).toBe(false);
    const result = await postInbox(body);
    expect(result).toEqual({ ok: false, held: true, error: STUDY_HELD_ERROR });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("holds the pack when a static shell serves HTML at /api/study", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } })),
    );
    const result = await postInbox(body);
    expect(result.held).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("posts once the inbox answers the probe", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return jsonResponse(200, { ok: true, inbox: true });
      }
      expect(init?.method).toBe("POST");
      return jsonResponse(200, { ok: true, stored: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await postInbox(body);
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not write on the GET probe in the Next route or the Dock static server", () => {
    const route = readFileSync("src/app/api/study/route.ts", "utf8");
    const getFn = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    expect(getFn).toContain("inbox: true");
    expect(getFn).not.toContain("writeFile");
    expect(getFn).not.toContain("forward(");
    const server = readFileSync("electron/static-server.cjs", "utf8");
    expect(server).toContain('pathname === "/api/study"');
    expect(server).toContain('JSON.stringify({ ok: true, inbox: true })');
    expect(server).toContain('clean.startsWith("/voice/")');
    expect(server).toContain('".wav": "audio/wav"');
  });
});
