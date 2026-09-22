import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CIRCADIA_SYNC_ORIGIN, circadiaVaultUrl } from "./circadia-sync";

describe("circadia-sync origin", () => {
  it("defines the Worker once and never constructs another address", () => {
    expect(CIRCADIA_SYNC_ORIGIN).toBe("https://circadia-sync.motleyjames.workers.dev");
    expect(circadiaVaultUrl("a".repeat(64))).toBe(`${CIRCADIA_SYNC_ORIGIN}/vault/${"a".repeat(64)}`);
    const hits: string[] = [];
    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "worker" || name === "meeseeks" || name === "phone") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.(ts|tsx|cjs|js)$/.test(name)) continue;
        const text = readFileSync(path, "utf8");
        if (text.includes("workers.dev") && !path.endsWith("circadia-sync.ts") && !path.endsWith("circadia-sync.test.ts")) {
          hits.push(path);
        }
      }
    }
    walk("src");
    expect(hits).toEqual([]);
  });
});
