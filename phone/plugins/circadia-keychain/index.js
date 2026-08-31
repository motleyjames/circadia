"use strict";

const { registerPlugin } = require("@capacitor/core");

const CircadiaKeychain = registerPlugin("CircadiaKeychain", {
  web: () =>
    Promise.resolve({
      async set() {
        return { ok: false };
      },
      async get() {
        return { value: null };
      },
      async remove() {
        return { ok: false };
      },
    }),
});

module.exports = { CircadiaKeychain };
