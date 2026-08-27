"use strict";

/**
 * Electron resolves package.json "main" relative to Contents/Resources/app.
 * An absolute POSIX path gets the leading slash stripped and concatenated
 * onto that folder — so main must be the relative file "main.cjs" in the bundle.
 * This stub reads sibling install.json and loads the real main from rest-ai.
 */

const fs = require("node:fs");
const path = require("node:path");

const installFile = path.join(__dirname, "install.json");
if (!fs.existsSync(installFile)) {
  throw new Error("This Circadia.app has no install.json. From rest-ai run: npm run dock");
}

const install = JSON.parse(fs.readFileSync(installFile, "utf8"));
if (!install || typeof install.repo !== "string") {
  throw new Error("install.json is missing repo. From rest-ai run: npm run dock");
}

const main = path.join(install.repo, "electron", "main.cjs");
if (!fs.existsSync(main)) {
  throw new Error(`Cannot find Circadia main at ${main}. Keep rest-ai where it was, or run npm run dock again.`);
}

process.chdir(install.repo);
require(main);
