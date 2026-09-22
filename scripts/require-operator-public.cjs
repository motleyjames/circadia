#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const file =
  process.env.CIRCADIA_OPERATOR_PUBLIC ||
  path.join("data", "study-inbox", ".operator", "operator-public.b64");

if (!fs.existsSync(file)) {
  console.error(
    "Stopped. Operator's public key is missing. Open Operator once so it can write the key, then run this again.",
  );
  process.exit(14);
}

const key = fs.readFileSync(file, "utf8").replace(/\s/g, "");
if (!key) {
  console.error(
    "Stopped. Operator's public key is missing. Open Operator once so it can write the key, then run this again.",
  );
  process.exit(14);
}

process.stdout.write(key);
