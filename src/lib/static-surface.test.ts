import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_MOD_KEY } from "./mod-key-shared";
import { APP_VERSION } from "./version";

const require = createRequire(import.meta.url);
const { parkSurfaces, restoreSurfaces } = require("../../electron/build-ui.cjs") as {
  parkSurfaces: (root?: string) => void;
  restoreSurfaces: (root?: string) => void;
};

afterAll(() => {
  restoreSurfaces(process.cwd());
});

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

describe("static pack parks Operator and API routes", () => {
  it("parks api and mod from build-ui, not via pageExtensions", () => {
    const buildUi = readFileSync("electron/build-ui.cjs", "utf8");
    const nextConfig = readFileSync("next.config.ts", "utf8");
    expect(buildUi).toContain(".api-parked");
    expect(buildUi).toContain(".mod-parked");
    expect(buildUi).toContain("finally");
    expect(buildUi).not.toContain("pageExtensions");
    expect(nextConfig).not.toContain("pageExtensions");
    expect(nextConfig).toContain("tsconfig.static.json");
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts["pack:static"]).toBe(
      "node electron/build-ui.cjs",
    );
    expect(readFileSync("src/app/page.tsx", "utf8")).not.toContain('from "./mod/page"');
    expect(existsSync("src/app/mod/page.tsx")).toBe(true);
    expect(existsSync("src/app/api/vault/route.ts")).toBe(true);
  });

  it("restores api and mod when a previous pack crashed mid-park", () => {
    const root = mkdtempSync(join(tmpdir(), "circadia-park-"));
    mkdirSync(join(root, "src", "app"), { recursive: true });
    mkdirSync(join(root, ".api-parked", "vault"), { recursive: true });
    writeFileSync(join(root, ".api-parked", "vault", "route.ts"), "export {}\n");
    mkdirSync(join(root, ".mod-parked"), { recursive: true });
    writeFileSync(join(root, ".mod-parked", "page.tsx"), "export default function M(){return null}\n");

    restoreSurfaces(root);
    expect(existsSync(join(root, "src/app/api/vault/route.ts"))).toBe(true);
    expect(existsSync(join(root, "src/app/mod/page.tsx"))).toBe(true);
    expect(existsSync(join(root, ".api-parked"))).toBe(false);
    expect(existsSync(join(root, ".mod-parked"))).toBe(false);

    parkSurfaces(root);
    expect(existsSync(join(root, "src/app/api"))).toBe(false);
    expect(existsSync(join(root, "src/app/mod"))).toBe(false);
    expect(existsSync(join(root, ".api-parked/vault/route.ts"))).toBe(true);
    expect(existsSync(join(root, ".mod-parked/page.tsx"))).toBe(true);

    restoreSurfaces(root);
    expect(readFileSync(join(root, "src/app/api/vault/route.ts"), "utf8")).toContain("export");
    expect(existsSync(join(root, "src/app/mod/page.tsx"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it(
    "emits out/ without /mod, /api, or the default operator passphrase",
    { timeout: 300_000 },
    () => {
      const env = { ...process.env };
      delete env.CIRCADIA_SURFACE;
      delete env.NEXT_PUBLIC_CIRCADIA_SURFACE;

      const result = spawnSync(process.execPath, ["electron/build-ui.cjs"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env,
        timeout: 300_000,
        maxBuffer: 20 * 1024 * 1024,
      });

      expect(existsSync("src/app/api/vault/route.ts")).toBe(true);
      expect(existsSync("src/app/mod/page.tsx")).toBe(true);
      expect(existsSync(".api-parked")).toBe(false);
      expect(existsSync(".mod-parked")).toBe(false);

      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(existsSync("out/index.html")).toBe(true);
      expect(readFileSync("electron/build-ui.cjs", "utf8")).toContain("stashDiaryServer");
      expect(readFileSync("electron/build-ui.cjs", "utf8")).toContain("restoreDiaryServer");
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(
        'Specified "headers" will not automatically work with "output: export"',
      );
      expect(readFileSync("out/index.html", "utf8")).toContain('name="circadia-version"');
      expect(readFileSync("out/index.html", "utf8")).toContain(APP_VERSION);
      expect(existsSync("out/voice/silence.wav")).toBe(true);
      expect(existsSync("out/voice/478/0.wav")).toBe(true);
      expect(existsSync("out/mod")).toBe(false);
      expect(existsSync("out/mod.html")).toBe(false);
      expect(existsSync("out/api")).toBe(false);

      const needle = Buffer.from(DEFAULT_MOD_KEY);
      const leaks: string[] = [];
      for (const file of walkFiles("out")) {
        if (readFileSync(file).includes(needle)) leaks.push(file);
      }
      expect(leaks, `default operator passphrase leaked into ${leaks.join(", ")}`).toEqual([]);
    },
  );
});
