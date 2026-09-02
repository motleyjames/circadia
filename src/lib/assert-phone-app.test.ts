import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./version";

const require = createRequire(import.meta.url);
const { assertPhoneApp } = require("../../scripts/assert-phone-app.cjs") as {
  assertPhoneApp: (root: string, version?: string) => string | null;
};

describe("assert-phone-app", () => {
  it("rejects a missing tree and an old index", () => {
    expect(assertPhoneApp("/tmp/circadia-no-such-app", "0.8.17")).toMatch(/No compiled/);
    const dir = mkdtempSync(join(tmpdir(), "circadia-old-www-"));
    writeFileSync(join(dir, "index.html"), "<html><body>old</body></html>\n");
    expect(assertPhoneApp(dir, "0.8.17")).toMatch(/not Circadia 0\.8\.17/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a public tree with this version and phone open CSS", () => {
    const dir = mkdtempSync(join(tmpdir(), "circadia-new-www-"));
    writeFileSync(
      join(dir, "index.html"),
      `<html><head><meta name="circadia-version" content="${APP_VERSION}" /></head></html>\n`,
    );
    writeFileSync(
      join(dir, "app.css"),
      "html.circadia-phone .brand-open-play .brand-open-identity { transition: opacity 0.8s; }\n",
    );
    expect(assertPhoneApp(dir, APP_VERSION)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a cover still promoted with translateZ", () => {
    const dir = mkdtempSync(join(tmpdir(), "circadia-tz-www-"));
    mkdirSync(join(dir, "public"), { recursive: true });
    writeFileSync(
      join(dir, "public", "index.html"),
      `<html><head><meta name="circadia-version" content="${APP_VERSION}" /></head></html>\n`,
    );
    writeFileSync(
      join(dir, "public", "app.css"),
      ".brand-open-cover { transform: translateZ(0); } html.circadia-phone .brand-open-mark { transform: none; }\n",
    );
    expect(assertPhoneApp(dir, APP_VERSION)).toMatch(/translateZ/);
    rmSync(dir, { recursive: true, force: true });
  });
});
