export type PackHttpResponse = {
  status: number;
  headers: Record<string, string>;
  data: unknown;
};

export type PackHttpRequest = {
  url: string;
  method: string;
  headers?: Record<string, string>;
  data?: string;
};

export type PackHttp = {
  request(opts: PackHttpRequest): Promise<PackHttpResponse>;
};

function lowerHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    out[key.toLowerCase()] = String(value);
  }
  return out;
}

/**
 * Capacitor's core native HTTP. Registered inside Capacitor.framework
 * (CAPHttpPlugin) — not subject to includePlugins, which only lists npm plugins.
 * Native URLSession does not send a CORS preflight.
 */
export async function capacitorPackHttp(): Promise<PackHttp> {
  const { CapacitorHttp } = await import("@capacitor/core");
  return {
    async request(opts) {
      const res = await CapacitorHttp.request({
        url: opts.url,
        method: opts.method,
        headers: opts.headers,
        data: opts.data,
        responseType: "text",
      });
      return {
        status: res.status,
        headers: lowerHeaders(res.headers as Record<string, string> | undefined),
        data: res.data,
      };
    },
  };
}
