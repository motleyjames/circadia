"use strict";

/**
 * Exit 1 when package.json lists a package that is not in node_modules.
 * git pull does not run npm install. put-on-phone used to skip install if
 * Next was already there, so a new dep (haptics) failed next build.
 */

const fs = require("fs");
const path = require("path");

function missingDeps(root = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  return names.filter((name) => !fs.existsSync(path.join(root, "node_modules", name, "package.json")));
}

if (require.main === module) {
  process.exit(missingDeps().length === 0 ? 0 : 1);
}

module.exports = { missingDeps };
