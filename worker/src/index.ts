import type { Env, R2Object } from "./r2";

export { type Env } from "./r2";

/** 32 bytes as lowercase hex. One alphabet for every object. Anchored. */
export const ACCOUNT_ID = /^[0-9a-f]{64}$/;

export const MAX_BYTES = 10 * 1024 * 1024;

const HASH_META = "h";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const accountId = vaultAccountId(url.pathname);
  if (accountId === "malformed") return empty(400);
  if (accountId === null) return empty(404);

  const presented = bearerKey(request);
  if (!presented) return empty(403);
  const presentedHash = await sha256Hex(presented);
  presented.fill(0);

  if (request.method === "GET") return getVault(env, accountId, presentedHash);
  if (request.method === "PUT") return putVault(request, env, accountId, presentedHash);
  return empty(405);
}

function vaultAccountId(pathname: string): string | "malformed" | null {
  if (!pathname.startsWith("/vault/")) return null;
  const rest = pathname.slice("/vault/".length);
  if (rest.includes("/") || rest.length === 0) return "malformed";
  if (!ACCOUNT_ID.test(rest)) return "malformed";
  return rest;
}

function bearerKey(request: Request): Uint8Array | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const prefix = "bearer ";
  if (header.length < prefix.length || header.slice(0, prefix.length).toLowerCase() !== prefix) {
    return null;
  }
  const token = header.slice(prefix.length).trim();
  if (!token) return null;
  try {
    const bin = atob(token);
    if (bin.length !== 32) return null;
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", asBufferSource(bytes));
  const raw = new Uint8Array(digest);
  let hex = "";
  for (const b of raw) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function empty(status: number): Response {
  return new Response(null, { status });
}

function withEtag(status: number, stored: R2Object): Response {
  return new Response(null, {
    status,
    headers: { etag: stored.httpEtag, "cache-control": "no-store" },
  });
}

function unquoteEtag(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("W/")) return unquoteEtag(trimmed.slice(2));
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function getVault(env: Env, accountId: string, presentedHash: string): Promise<Response> {
  const meta = await env.VAULTS.head(accountId);
  if (!meta) return empty(404);
  const storedHash = meta.customMetadata[HASH_META] ?? "";
  if (!hashesEqual(storedHash, presentedHash)) return empty(403);
  const object = await env.VAULTS.get(accountId);
  if (!object) return empty(404);
  const body = await object.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      etag: object.httpEtag,
      "content-type": "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}

async function putVault(
  request: Request,
  env: Env,
  accountId: string,
  presentedHash: string,
): Promise<Response> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n > MAX_BYTES) return empty(413);
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return empty(413);

  const created = await env.VAULTS.put(accountId, body, {
    onlyIf: { etagDoesNotMatch: "*" },
    customMetadata: { [HASH_META]: presentedHash },
  });
  if (created) return withEtag(201, created);

  const existing = await env.VAULTS.head(accountId);
  if (!existing) return empty(412);
  const storedHash = existing.customMetadata[HASH_META] ?? "";
  if (!hashesEqual(storedHash, presentedHash)) return empty(403);

  const match = request.headers.get("if-match");
  if (!match) return empty(412);
  const updated = await env.VAULTS.put(accountId, body, {
    onlyIf: { etagMatches: unquoteEtag(match) },
    customMetadata: { [HASH_META]: presentedHash },
  });
  if (!updated) return empty(412);
  return withEtag(200, updated);
}
