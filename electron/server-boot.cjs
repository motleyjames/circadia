"use strict";

const path = require("node:path");

const root = process.env.CIRCADIA_SERVER_ROOT;
if (!root) {
  console.error("CIRCADIA_SERVER_ROOT is not set");
  process.exit(1);
}

process.chdir(root);
require(path.join(root, "server.js"));
