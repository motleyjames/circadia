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

function insideRoot(root, abs) {
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function fileFor(root, urlPath) {
  const clean = decodeURIComponent(String(urlPath || "/").split("?")[0].split("#")[0]);
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const abs = path.normalize(path.join(root, rel));
  if (!insideRoot(root, abs)) return null;
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  const indexed = path.join(abs, "index.html");
  if (insideRoot(root, indexed) && fs.existsSync(indexed)) return indexed;
  const html = `${abs}.html`;
  if (insideRoot(root, html) && fs.existsSync(html)) return html;
  if (clean === "/voice" || clean.startsWith("/voice/")) return null;
  const fallback = path.join(root, "index.html");
  return fs.existsSync(fallback) ? fallback : null;
}

function send(res, status, body, headers) {
  res.writeHead(status, { "cache-control": "no-store", ...headers });
  res.end(body);
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
    send(res, 400, JSON.stringify({ ok: false, error: "Invalid JSON." }), {
      "content-type": "application/json",
    });
    return;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    send(res, 400, JSON.stringify({ ok: false, error: "Unknown schema." }), {
      "content-type": "application/json",
    });
    return;
  }
  const schema = raw.schema;
  const allowed =
    schema === "circadia-study-v1" || schema === "circadia-roster-v1" || schema === "circadia-fault-v1";
  if (!allowed) {
    send(res, 400, JSON.stringify({ ok: false, error: "Unknown schema." }), {
      "content-type": "application/json",
    });
    return;
  }
  if (schema === "circadia-study-v1" && ("name" in raw || "dream" in raw || "email" in raw || "phone" in raw)) {
    send(res, 400, JSON.stringify({ ok: false, error: "Pack contains identity fields." }), {
      "content-type": "application/json",
    });
    return;
  }
  fs.mkdirSync(inbox, { recursive: true });
  const id = typeof raw.participantId === "string" ? raw.participantId.slice(0, 8) : "unknown";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(inbox, `${id}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(raw, null, 2), "utf8");

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

  send(res, 200, JSON.stringify({ ok: true, stored: true, forwarded }), {
    "content-type": "application/json",
  });
}

function createServer(options) {
  const root = options.root;
  const inbox = options.inbox;
  const ingest = (options.ingest || "").trim();
  const ingestToken = (options.ingestToken || "").trim();
  if (!root || !inbox) throw new Error("static server needs root and inbox");

  return http.createServer((req, res) => {
    const url = req.url || "/";
    const pathname = url.split("?")[0];
    if (pathname === "/api/study") {
      if (req.method === "GET" || req.method === "HEAD") {
        send(res, 200, req.method === "HEAD" ? undefined : JSON.stringify({ ok: true, inbox: true }), {
          "content-type": "application/json",
        });
        return;
      }
      if (req.method === "POST") {
        handleStudy(req, res, inbox, ingest, ingestToken).catch(() => {
          send(res, 500, JSON.stringify({ ok: false, error: "Could not store pack." }), {
            "content-type": "application/json",
          });
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
    const data = fs.readFileSync(file);
    send(res, 200, req.method === "HEAD" ? undefined : data, {
      "content-type": MIME[path.extname(file)] || "application/octet-stream",
    });
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
