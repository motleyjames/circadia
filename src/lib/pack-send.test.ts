import { describe, expect, it } from "vitest";
import { CIRCADIA_SYNC_ORIGIN } from "./circadia-sync";
import type { PackHttp, PackHttpRequest, PackHttpResponse } from "./pack-http";
import { putSealedPack } from "./pack-send";
import type { PackEnvelope } from "./pack-seal";

const ENVELOPE: PackEnvelope = { v: 2, epk: "ZXBr", iv: "aXY", ct: "Y3Q" };
const WORKER_ID = "aa".repeat(32);
const BEARER = "YmVhcmVy";

function http(handler: (req: PackHttpRequest, n: number) => PackHttpResponse): {
  calls: PackHttpRequest[];
  impl: PackHttp;
} {
  const calls: PackHttpRequest[] = [];
  return {
    calls,
    impl: {
      async request(opts) {
        calls.push(opts);
        return handler(opts, calls.length);
      },
    },
  };
}

describe("pack send", () => {
  it("registers, then If-Match; 412 handled once", async () => {
    const first = http((req, n) => {
      expect(req.method).toBe("PUT");
      expect(req.headers?.["if-match"]).toBeUndefined();
      expect(req.url).toBe(`${CIRCADIA_SYNC_ORIGIN}/vault/${WORKER_ID}`);
      expect(n).toBe(1);
      return { status: 201, headers: { etag: '"e1"' }, data: "" };
    });
    const created = await putSealedPack({
      envelope: ENVELOPE,
      workerId: WORKER_ID,
      bearer: BEARER,
      etag: null,
      http: first.impl,
    });
    expect(created).toEqual({ ok: true, etag: '"e1"' });

    const later = http((req) => {
      expect(req.headers?.["if-match"]).toBe('"e1"');
      return { status: 200, headers: { etag: '"e2"' }, data: "" };
    });
    const updated = await putSealedPack({
      envelope: ENVELOPE,
      workerId: WORKER_ID,
      bearer: BEARER,
      etag: '"e1"',
      http: later.impl,
    });
    expect(updated).toEqual({ ok: true, etag: '"e2"' });

    const stale = http((req, n): PackHttpResponse => {
      if (n === 1) {
        expect(req.method).toBe("PUT");
        return { status: 412, headers: {}, data: "" };
      }
      if (n === 2) {
        expect(req.method).toBe("GET");
        return { status: 200, headers: { etag: '"e9"' }, data: "" };
      }
      expect(req.method).toBe("PUT");
      expect(req.headers?.["if-match"]).toBe('"e9"');
      return { status: 200, headers: { etag: '"e10"' }, data: "" };
    });
    const recovered = await putSealedPack({
      envelope: ENVELOPE,
      workerId: WORKER_ID,
      bearer: BEARER,
      etag: '"stale"',
      http: stale.impl,
    });
    expect(recovered).toEqual({ ok: true, etag: '"e10"' });
    expect(stale.calls).toHaveLength(3);

    const twice = http(() => ({ status: 412, headers: {}, data: "" }));
    const failed = await putSealedPack({
      envelope: ENVELOPE,
      workerId: WORKER_ID,
      bearer: BEARER,
      etag: '"x"',
      http: twice.impl,
    });
    expect(failed.ok).toBe(false);
    expect(twice.calls.length).toBeLessThanOrEqual(3);
  });

  it("what reaches the Worker is an envelope — no pack field name appears in it", async () => {
    const seen: string[] = [];
    const mock = http((req) => {
      seen.push(req.data ?? "");
      return { status: 201, headers: { etag: '"e1"' }, data: "" };
    });
    await putSealedPack({
      envelope: ENVELOPE,
      workerId: WORKER_ID,
      bearer: BEARER,
      etag: null,
      http: mock.impl,
    });
    const body = JSON.parse(seen[0]!) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["ct", "epk", "iv", "v"]);
    const blob = seen[0]!;
    for (const field of [
      "schema",
      "participantId",
      "nights",
      "profile",
      "appVersion",
      "surface",
      "demoWeek",
      "sessions",
      "chat",
      "nightsElapsed",
      "safetyFlags",
    ]) {
      expect(blob).not.toContain(field);
    }
  });
});
