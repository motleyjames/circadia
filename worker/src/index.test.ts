import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_ID, handleRequest, MAX_BYTES } from "./index";
import type { Env, R2Bucket, R2Conditional, R2Object, R2ObjectBody, R2PutOptions } from "./r2";

class MemoryR2 implements R2Bucket {
  readonly objects = new Map<string, { etag: string; body: ArrayBuffer; customMetadata: Record<string, string> }>();
  touches = 0;
  lastPut: { key: string; body: ArrayBuffer; options?: R2PutOptions } | null = null;
  private seq = 0;

  private touch(): void {
    this.touches += 1;
  }

  private view(key: string): R2Object | null {
    const row = this.objects.get(key);
    if (!row) return null;
    return {
      key,
      etag: row.etag,
      httpEtag: `"${row.etag}"`,
      size: row.body.byteLength,
      customMetadata: { ...row.customMetadata },
    };
  }

  async head(key: string): Promise<R2Object | null> {
    this.touch();
    return this.view(key);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    this.touch();
    const row = this.objects.get(key);
    if (!row) return null;
    const meta = this.view(key)!;
    const copy = row.body.slice(0);
    return {
      ...meta,
      arrayBuffer: async () => copy,
    };
  }

  async put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<R2Object | null> {
    this.touch();
    this.lastPut = { key, body: value.slice(0), options };
    const existing = this.objects.get(key);
    if (options?.onlyIf && !onlyIfOk(existing, options.onlyIf)) return null;
    this.seq += 1;
    const etag = `e${this.seq}`;
    this.objects.set(key, {
      etag,
      body: value.slice(0),
      customMetadata: { ...(options?.customMetadata ?? {}) },
    });
    return this.view(key);
  }
}

/** Same missing-object rule as Miniflare's R2 validator: etagDoesNotMatch is ignored when absent. */
function onlyIfOk(
  existing: { etag: string } | undefined,
  cond: R2Conditional,
): boolean {
  if (!existing) return cond.etagMatches === undefined;
  if (cond.etagMatches !== undefined && cond.etagMatches !== "*" && cond.etagMatches !== existing.etag) {
    return false;
  }
  if (cond.etagDoesNotMatch !== undefined) {
    if (cond.etagDoesNotMatch === "*" || cond.etagDoesNotMatch === existing.etag) return false;
  }
  return true;
}

function envWith(bucket: MemoryR2): Env {
  return { VAULTS: bucket };
}

function keyB64(fill = 7): string {
  const bytes = new Uint8Array(32);
  bytes.fill(fill);
  bytes[0] = fill + 1;
  return btoa(String.fromCharCode(...bytes));
}

const ID = "2f1a0c8e4b3d4a919c2e7d6b5a4c3e212f1a0c8e4b3d4a919c2e7d6b5a4c3e21";
const KEY = keyB64(3);
const OTHER = keyB64(9);
const BLOB = new Uint8Array([0xca, 0xfe, 0x00, 0x01]);

function putReq(id: string, key: string, body: Uint8Array, etag?: string): Request {
  const headers = new Headers({
    authorization: `Bearer ${key}`,
    "content-length": String(body.byteLength),
  });
  if (etag) headers.set("if-match", etag);
  return new Request(`https://sync.test/vault/${id}`, { method: "PUT", headers, body: body.slice() });
}

function getReq(id: string, key: string): Request {
  return new Request(`https://sync.test/vault/${id}`, {
    method: "GET",
    headers: { authorization: `Bearer ${key}` },
  });
}

describe("circadia-sync worker", () => {
  it("rejects a PUT with a wrong auth key and leaves the stored blob unchanged", async () => {
    const bucket = new MemoryR2();
    const created = await handleRequest(putReq(ID, KEY, BLOB), envWith(bucket));
    expect(created.status).toBe(201);
    const etag = created.headers.get("etag");
    const before = new Uint8Array(bucket.objects.get(ID)!.body);
    const smashed = await handleRequest(putReq(ID, OTHER, new Uint8Array([1, 2, 3]), etag ?? undefined), envWith(bucket));
    expect(smashed.status).toBe(403);
    expect(new Uint8Array(bucket.objects.get(ID)!.body)).toEqual(before);
  });

  it("rejects a PUT with a stale etag and changes nothing", async () => {
    const bucket = new MemoryR2();
    const created = await handleRequest(putReq(ID, KEY, BLOB), envWith(bucket));
    expect(created.status).toBe(201);
    const before = new Uint8Array(bucket.objects.get(ID)!.body);
    const stale = await handleRequest(putReq(ID, KEY, new Uint8Array([9, 9, 9]), '"not-the-etag"'), envWith(bucket));
    expect(stale.status).toBe(412);
    expect(new Uint8Array(bucket.objects.get(ID)!.body)).toEqual(before);
  });

  it("lets exactly one of two concurrent registrations for the same unseen id succeed", async () => {
    const bucket = new MemoryR2();
    const env = envWith(bucket);
    const [a, b] = await Promise.all([
      handleRequest(putReq(ID, KEY, BLOB), env),
      handleRequest(putReq(ID, OTHER, new Uint8Array([4, 4, 4])), env),
    ]);
    const ok = [a.status, b.status].filter((s) => s === 201 || s === 200);
    expect(ok).toHaveLength(1);
    expect(bucket.objects.size).toBe(1);
  });

  it("stores only the auth key hash, never the raw key", async () => {
    const bucket = new MemoryR2();
    await handleRequest(putReq(ID, KEY, BLOB), envWith(bucket));
    const written = bucket.lastPut;
    expect(written).toBeTruthy();
    const meta = JSON.stringify(written!.options?.customMetadata ?? {});
    expect(meta).not.toContain(KEY);
    const body = new TextDecoder().decode(written!.body);
    expect(body).not.toContain(KEY);
    const stored = bucket.objects.get(ID)!;
    expect(JSON.stringify(stored.customMetadata)).not.toContain(KEY);
    expect(stored.customMetadata.h).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.customMetadata.h).not.toBe(KEY);
  });

  it("returns 404 with no detail for an unknown account", async () => {
    const bucket = new MemoryR2();
    const res = await handleRequest(getReq(ID, KEY), envWith(bucket));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(res.headers.get("etag")).toBeNull();
  });

  it("rejects a malformed accountId before any R2 access", async () => {
    const bucket = new MemoryR2();
    const bad = [
      "https://sync.test/vault/not-a-hex-id",
      "https://sync.test/vault/2f1a0c8e-4b3d-4a91-9c2e-7d6b5a4c3e21",
      `https://sync.test/vault/${ID.slice(0, 63)}`,
      `https://sync.test/vault/${ID}0`,
      `https://sync.test/vault/${ID.toUpperCase()}`,
      `https://sync.test/vault/${ID}%2fextra`,
      `https://sync.test/vault/${ID}/extra`,
      "https://sync.test/vault/",
    ];
    for (const url of bad) {
      bucket.touches = 0;
      const res = await handleRequest(
        new Request(url, { method: "GET", headers: { authorization: `Bearer ${KEY}` } }),
        envWith(bucket),
      );
      expect(res.status, url).toBe(400);
      expect(bucket.touches, url).toBe(0);
    }
    expect(ACCOUNT_ID.test(ID)).toBe(true);
    expect(ACCOUNT_ID.test("2f1a0c8e-4b3d-4a91-9c2e-7d6b5a4c3e21")).toBe(false);
    expect(ACCOUNT_ID.test(ID.toUpperCase())).toBe(false);
  });

  it("never decrypts, parses, or inspects the body", async () => {
    const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\.json\s*\(/);
    expect(src).not.toMatch(/JSON\.parse/);
    expect(src).not.toMatch(/TextDecoder/);
    expect(src).not.toMatch(/decrypt/i);
    expect(src).not.toMatch(/isVaultEnvelope/);
    const bucket = new MemoryR2();
    await handleRequest(putReq(ID, KEY, BLOB), envWith(bucket));
    const got = await handleRequest(getReq(ID, KEY), envWith(bucket));
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(BLOB);
  });

  it("imports nothing from src/", () => {
    const files = ["src/index.ts", "src/r2.ts", "src/index.test.ts", "wrangler.toml", "tsconfig.json"];
    for (const file of files) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(src, file).not.toMatch(/from\s+["']@\//);
      expect(src, file).not.toMatch(/from\s+["']\.\.\/src\//);
      expect(src, file).not.toMatch(/from\s+["']\.\.\/\.\.\/src\//);
    }
    expect(MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it("stores two objects at different ids without a type, size heuristic, or kind branch", async () => {
    const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\bkind\b|\blookupId\b|account record|diary vault/i);
    expect(src).not.toMatch(/customMetadata:\s*\{[^}]*\b(type|kind|t)\b/);
    expect(src).toContain("body.byteLength > MAX_BYTES");
    expect(src).not.toMatch(/byteLength\s*[<]=?/);

    const bucket = new MemoryR2();
    const env = envWith(bucket);
    const idA = "a1b2c3d4e5f647898abcdef012345678a1b2c3d4e5f647898abcdef012345678";
    const idB = "b2c3d4e5f6a748909bcdef0123456789b2c3d4e5f6a748909bcdef0123456789";
    const keyA = keyB64(11);
    const keyB = keyB64(13);
    const small = new Uint8Array(200).fill(0x11);
    const large = new Uint8Array(8000).fill(0x22);

    expect((await handleRequest(putReq(idA, keyA, small), env)).status).toBe(201);
    expect((await handleRequest(putReq(idB, keyB, large), env)).status).toBe(201);

    const gotA = await handleRequest(getReq(idA, keyA), env);
    const gotB = await handleRequest(getReq(idB, keyB), env);
    expect(gotA.status).toBe(200);
    expect(gotB.status).toBe(200);
    expect(new Uint8Array(await gotA.arrayBuffer())).toEqual(small);
    expect(new Uint8Array(await gotB.arrayBuffer())).toEqual(large);
    expect(gotA.headers.get("content-type")).toBe(gotB.headers.get("content-type"));
    expect((await handleRequest(getReq(idA, keyB), env)).status).toBe(403);
    expect((await handleRequest(getReq(idB, keyA), env)).status).toBe(403);
    expect(Object.keys(bucket.objects.get(idA)!.customMetadata)).toEqual(["h"]);
    expect(Object.keys(bucket.objects.get(idB)!.customMetadata)).toEqual(["h"]);
  });
});
