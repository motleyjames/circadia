"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const publicSrc = path.join(root, "public");

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Missing .next/standalone/server.js. Did next build run with output: 'standalone'?");
  process.exit(1);
}

copyDir(staticSrc, path.join(standalone, ".next", "static"));
if (fs.existsSync(publicSrc)) {
  copyDir(publicSrc, path.join(standalone, "public"));
}

console.log("Standalone server is ready to package.");
