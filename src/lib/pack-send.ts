import { circadiaVaultUrl } from "@/lib/circadia-sync";
import type { PackEnvelope } from "@/lib/pack-seal";
import type { PackHttp } from "@/lib/pack-http";

export type PutSealedResult = { ok: true; etag: string } | { ok: false; error: string };

function headerOf(headers: Record<string, string>, name: string): string | null {
  const value = headers[name.toLowerCase()];
  return value && value.trim() ? value.trim() : null;
}

async function putOnce(
  http: PackHttp,
  url: string,
  bearer: string,
  body: string,
  etag: string | null,
): Promise<{ status: number; etag: string | null }> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${bearer}`,
    "content-type": "application/json",
  };
  if (etag) headers["if-match"] = etag;
  const res = await http.request({ url, method: "PUT", headers, data: body });
  return { status: res.status, etag: headerOf(res.headers, "etag") };
}

async function readEtag(http: PackHttp, url: string, bearer: string): Promise<string | null> {
  const res = await http.request({
    url,
    method: "GET",
    headers: { authorization: `Bearer ${bearer}` },
  });
  if (res.status !== 200) return null;
  return headerOf(res.headers, "etag");
}

/**
 * First write registers the object (no If-Match). Later writes send If-Match.
 * A 412 reads the current ETag once and retries once.
 */
export async function putSealedPack(input: {
  envelope: PackEnvelope;
  workerId: string;
  bearer: string;
  etag: string | null;
  http: PackHttp;
}): Promise<PutSealedResult> {
  const url = circadiaVaultUrl(input.workerId);
  const body = JSON.stringify(input.envelope);
  try {
    const first = await putOnce(input.http, url, input.bearer, body, input.etag);
    if (first.status === 200 || first.status === 201) {
      if (!first.etag) return { ok: false, error: "Send failed (missing ETag)." };
      return { ok: true, etag: first.etag };
    }
    if (first.status !== 412) {
      return { ok: false, error: `Send failed (${first.status}).` };
    }
    const current = await readEtag(input.http, url, input.bearer);
    if (!current) return { ok: false, error: "Send failed (412)." };
    const retry = await putOnce(input.http, url, input.bearer, body, current);
    if (retry.status === 200 || retry.status === 201) {
      if (!retry.etag) return { ok: false, error: "Send failed (missing ETag)." };
      return { ok: true, etag: retry.etag };
    }
    return { ok: false, error: `Send failed (${retry.status}).` };
  } catch {
    return { ok: false, error: "Could not reach the Worker. The pack is still on this device." };
  }
}
