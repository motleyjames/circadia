"use strict";

/**
 * Refuse to put an iPhone build on the device if the bundled diary is not
 * this Circadia version. Xcode folder-references can keep a stale public/
 * inside DerivedData while git already moved on.
 */

const fs = require("node:fs");
const path = require("node:path");

function repoRoot() {
  return path.join(__dirname, "..");
}

function appVersion(root = repoRoot()) {
  return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

function findIndexHtml(root) {
  const candidates = [
    path.join(root, "index.html"),
    path.join(root, "public", "index.html"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return walkFiles(root).find((file) => path.basename(file) === "index.html") || null;
}

function cssTextNear(indexFile) {
  const dir = path.dirname(indexFile);
  return walkFiles(dir)
    .filter((file) => file.endsWith(".css"))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
}

/**
 * @returns {string | null} error message, or null if the tree is this version.
 */
function assertPhoneApp(root, version = appVersion()) {
  if (!root || !fs.existsSync(root)) {
    return "No compiled iPhone diary to check.";
  }
  const indexFile = findIndexHtml(root);
  if (!indexFile) {
    return "The iPhone build has no index.html. The diary was not packed into this .app.";
  }
  const html = fs.readFileSync(indexFile, "utf8");
  if (!html.includes('name="circadia-version"') || !html.includes(version)) {
    return `The iPhone build is not Circadia ${version}. Installing it would leave the old diary on the phone.`;
  }
  const css = cssTextNear(indexFile);
  if (css.includes("brand-open-cover") && /brand-open-cover\{[^}]*translateZ/i.test(css.replace(/\s+/g, ""))) {
    return "The iPhone CSS still promotes the open cover with translateZ. WKWebView would freeze the wordmark.";
  }
  if (css.includes("brand-open-cover") && !css.includes("circadia-phone")) {
    return "The iPhone CSS is missing the phone open rules.";
  }
  return null;
}

module.exports = { assertPhoneApp, findIndexHtml, appVersion };

if (require.main === module) {
  const target = process.argv[2] || path.join(repoRoot(), "phone", "ios", "App", "App", "public");
  const err = assertPhoneApp(target);
  if (err) {
    console.error(err);
    process.exit(11);
  }
}
