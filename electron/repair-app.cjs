"use strict";

const fix = require("./fix-mac.cjs");

if (require.main === module) {
  try {
    fix.repairAll();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = fix;
