"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = process.env.CIRCADIA_STATIC_ROOT;
const inbox = process.env.CIRCADIA_DATA_DIR;
const port = Number(process.env.PORT) || 43147;
const ingest = (process.env.STUDY_INGEST_URL || "").trim();
const ingestToken = (process.env.STUDY_INGEST_TOKEN || "").trim();

if (!root || !inbox) {
  console.error("CIRCADIA_STATIC_ROOT and CIRCADIA_DATA_DIR are required.");
  process.exit(1);
}

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
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function insideRoot(abs) {
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function fileFor(urlPath) {
  const clean = decodeURIComponent(String(urlPath || "/").split("?")[0].split("#")[0]);
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const abs = path.normalize(path.join(root, rel));
  if (!insideRoot(abs)) return null;
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  const indexed = path.join(abs, "index.html");
  if (insideRoot(indexed) && fs.existsSync(indexed)) return indexed;
  const html = `${abs}.html`;
  if (insideRoot(html) && fs.existsSync(html)) return html;
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

async function handleStudy(req, res) {
  let raw;
  try {
    raw = JSON.parse(await readBody(req));
  } catch {
    send(res, 400, JSON.stringify({ ok: false, error: "Invalid JSON." }), {
      "content-type": "application/json",
    });
    return;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.schema !== "circadia-study-v1") {
    send(res, 400, JSON.stringify({ ok: false, error: "Unknown schema." }), {
      "content-type": "application/json",
    });
    return;
  }
  if ("name" in raw || "dream" in raw) {
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

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (req.method === "POST" && url.split("?")[0] === "/api/study") {
    handleStudy(req, res).catch(() => {
      send(res, 500, JSON.stringify({ ok: false, error: "Could not store pack." }), {
        "content-type": "application/json",
      });
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }
  const file = fileFor(url);
  if (!file) {
    send(res, 404, "Not found");
    return;
  }
  const data = fs.readFileSync(file);
  send(res, 200, req.method === "HEAD" ? undefined : data, {
    "content-type": MIME[path.extname(file)] || "application/octet-stream",
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Circadia UI on http://127.0.0.1:${port}`);
});
