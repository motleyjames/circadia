"use strict";

const os = require("node:os");
const path = require("node:path");
const { assembleNativeApp, compileSwift, whichNode } = require("./native-bundle.cjs");

function installNativeHome() {
  const repo = process.env.CIRCADIA_REPO || path.join(__dirname, "..");
  const swiftSrc = process.env.CIRCADIA_SWIFT || path.join(__dirname, "launcher.swift");
  const dest = process.env.CIRCADIA_DEST || path.join(os.homedir(), "Applications", "Circadia.app");
  const binTmp = process.env.CIRCADIA_PREBUILT_BIN || path.join(os.tmpdir(), "CircadiaBin");

  if (process.env.CIRCADIA_PREBUILT_BIN) {
    const fs = require("node:fs");
    if (!fs.existsSync(binTmp)) throw new Error("prebuilt binary missing: " + binTmp);
  } else {
    compileSwift(swiftSrc, binTmp);
    console.log("compiled", binTmp);
  }

  const result = assembleNativeApp({
    kind: "diary",
    repo,
    dest,
    binarySrc: binTmp,
    node: whichNode(),
  });
  console.log("INSTALLED", result.dest);
  return result;
}

module.exports = { assembleNativeApp, compileSwift, installNativeHome, whichNode };

if (require.main === module) {
  try {
    installNativeHome();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
