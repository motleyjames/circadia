"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Anchored. The filename for a stored pack is built from this — never from raw input. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * On every response. The diary is a local origin any web page can try to reach,
 * so: never sniff a type we did not declare, never let another site frame it,
 * never leak the local URL onward.
 */
const SAFE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
};

function insideRoot(root, abs) {
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * A path we are willing to open: inside the root lexically, still inside it after
 * symlinks resolve, and a regular file. The lexical check alone is not enough —
 * a symlink under the root can point anywhere on disk.
 */
function servableFile(root, candidate) {
  if (!insideRoot(root, candidate)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const real = fs.realpathSync(candidate);
    if (!insideRoot(realRoot, real)) return null;
    return fs.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Map a request path to a file under root, or null.
 * Returns null rather than throwing: a malformed percent-escape (`/%`) used to
 * take the whole app down with an unhandled URIError.
 */
function fileFor(root, urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(String(urlPath || "/").split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (clean.includes("\0")) return null;
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const abs = path.normalize(path.join(root, rel));
  const direct = servableFile(root, abs);
  if (direct) return direct;
  const indexed = servableFile(root, path.join(abs, "index.html"));
  if (indexed) return indexed;
  const html = servableFile(root, `${abs}.html`);
  if (html) return html;
  if (clean === "/voice" || clean.startsWith("/voice/")) return null;
  return servableFile(root, path.join(root, "index.html"));
}

/**
 * Same-origin only. A missing Origin is a non-browser caller (the app itself,
 * curl); any other site's Origin is a page trying to drive the local diary.
 * Mirrors `isLocalRequest` in src/lib/vault.ts.
 */
function localOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

function send(res, status, body, headers) {
  if (res.writableEnded) return;
  res.writeHead(status, { ...SAFE_HEADERS, ...headers });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), { "content-type": "application/json" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleStudy(req, res, inbox, ingest, ingestToken) {
  let raw;
  try {
    raw = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { ok: false, error: "Invalid JSON." });
    return;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    sendJson(res, 400, { ok: false, error: "Unknown schema." });
    return;
  }
  const schema = raw.schema;
  const allowed =
    schema === "circadia-study-v1" || schema === "circadia-roster-v1" || schema === "circadia-fault-v1";
  if (!allowed) {
    sendJson(res, 400, { ok: false, error: "Unknown schema." });
    return;
  }
  if (schema === "circadia-study-v1" && ("name" in raw || "dream" in raw || "email" in raw || "phone" in raw)) {
    sendJson(res, 400, { ok: false, error: "Pack contains identity fields." });
    return;
  }
  // The participant number is the only caller-supplied part of the filename, so it
  // must be a real UUID before it is allowed anywhere near a path. A bare
  // `slice(0, 8)` let `../../..` through and wrote packs outside the inbox.
  const id =
    typeof raw.participantId === "string" && UUID_RE.test(raw.participantId)
      ? raw.participantId.slice(0, 8).toLowerCase()
      : "unknown";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(inbox, `${id}-${stamp}.json`);
  // Belt and braces: the slug above cannot escape, and this stays true if it changes.
  if (!insideRoot(inbox, file)) {
    sendJson(res, 400, { ok: false, error: "Invalid participant number." });
    return;
  }
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(raw, null, 2), { encoding: "utf8", mode: 0o600 });

  let forwarded = false;
  if (ingest) {
    try {
      const headers = { "content-type": "application/json" };
      if (ingestToken) headers.authorization = `Bearer ${ingestToken}`;
      const result = await fetch(ingest, { method: "POST", headers, body: JSON.stringify(raw) });
      forwarded = result.ok;
    } catch {
      forwarded = false;
    }
  }

  sendJson(res, 200, { ok: true, stored: true, forwarded });
}

function createServer(options) {
  const root = options.root;
  const inbox = options.inbox;
  const ingest = (options.ingest || "").trim();
  const ingestToken = (options.ingestToken || "").trim();
  if (!root || !inbox) throw new Error("static server needs root and inbox");

  const handle = (req, res) => {
    const url = req.url || "/";
    const pathname = url.split("?")[0];
    if (pathname === "/api/study") {
      // A page on any site can send a no-preflight POST to this port while the
      // app is open. Only this origin may drive the inbox.
      if (!localOrigin(req)) {
        sendJson(res, 403, { ok: false, error: "Cross-site request refused." });
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        send(res, 200, req.method === "HEAD" ? undefined : JSON.stringify({ ok: true, inbox: true }), {
          "content-type": "application/json",
        });
        return;
      }
      if (req.method === "POST") {
        handleStudy(req, res, inbox, ingest, ingestToken).catch(() => {
          sendJson(res, 500, { ok: false, error: "Could not store pack." });
        });
        return;
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method not allowed");
      return;
    }
    const file = fileFor(root, url);
    if (!file) {
      send(res, 404, "Not found");
      return;
    }
    let data;
    try {
      data = fs.readFileSync(file);
    } catch {
      // Vanished or unreadable between the stat and the read.
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, req.method === "HEAD" ? undefined : data, {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
    });
  };

  // Last resort. No single request may take the diary down: an unhandled throw
  // in here is an uncaught exception, and Node ends the process.
  return http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch {
      send(res, 500, "Server error");
    }
  });
}

function listen(options) {
  const requested = Number(options.port);
  const port = Number.isFinite(requested) && requested > 0 ? requested : 0;
  const server = createServer(options);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const bound = typeof address === "object" && address ? address.port : port;
      resolve({ server, port: bound, url: `http://127.0.0.1:${bound}` });
    });
  });
}

module.exports = { createServer, listen, fileFor };

if (require.main === module) {
  listen({
    root: process.env.CIRCADIA_STATIC_ROOT,
    inbox: process.env.CIRCADIA_DATA_DIR,
    port: process.env.PORT,
    ingest: process.env.STUDY_INGEST_URL,
    ingestToken: process.env.STUDY_INGEST_TOKEN,
  })
    .then(({ url }) => {
      console.log(`Circadia UI on ${url}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
