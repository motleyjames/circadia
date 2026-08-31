#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const plistPath = path.join(__dirname, "ios", "App", "App", "Info.plist");

if (!fs.existsSync(plistPath)) {
  console.log("No iOS project yet. On a Mac: cd phone && npx cap add ios && npm run sync");
  process.exit(0);
}

let src = fs.readFileSync(plistPath, "utf8");

function hasKey(key) {
  return src.includes(`<key>${key}</key>`);
}

function insertAtRoot(block) {
  const idx = src.lastIndexOf("</dict>");
  src = `${src.slice(0, idx)}${block}\n${src.slice(idx)}`;
}

let changed = false;

if (!hasKey("UIBackgroundModes")) {
  insertAtRoot(`	<key>UIBackgroundModes</key>
	<array>
		<string>audio</string>
	</array>`);
  changed = true;
}

if (!hasKey("UIViewControllerBasedStatusBarAppearance")) {
  insertAtRoot(`	<key>UIViewControllerBasedStatusBarAppearance</key>
	<true/>`);
  changed = true;
}

if (changed) {
  fs.writeFileSync(plistPath, src);
  console.log("Patched Info.plist (audio background + status bar).");
} else {
  console.log("Info.plist already has phone keys.");
}
