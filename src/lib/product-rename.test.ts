import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CIRCADIA_SYNC_ORIGIN } from "./circadia-sync";
import { deriveInviteParticipantIdV2, INVITE_DERIVE_PREFIX, INVITE_DERIVE_PREFIX_V2, normalizeInviteCodeV2 } from "./invite";
import { KEYCHAIN_SERVICE } from "./keychain";
import { derivePackLocation, PACK_AUTH_INFO, PACK_ID_INFO } from "./pack-derive";
import { PACK_SEAL_LABEL } from "./pack-seal";
import { OPERATOR_PRODUCT_NAME, PRODUCT_NAME } from "./product";
import { FOLDED_INBOX_KEY, FOLDED_PACK_KEY, LAST_LOGIN_KEY, LOCKS_KEY, SESSION_KEY, SESSION_UNLOCK_KEY, STORAGE_KEY, VAULT_KEY } from "./storage";
import { vaultFilePath } from "./vault-file";

const CIRCADIAN_BEFORE = 45;
const CIRCADIAN_FILES = [
  "src/lib/research.ts",
  "src/lib/advisor.ts",
  "src/lib/morning-reading.ts",
  "src/lib/chat.ts",
  "src/lib/recommendations.ts",
  "src/lib/chat-corpus.ts",
  "src/lib/diary-consult.ts",
  "src/lib/safety-triage.ts",
  "docs/BLUEPRINT.md",
];
const GOLDEN_CODE = "KT5E-J4C2-W5HC-PPRA";
const GOLDEN_ID = "348e7d8b-e0a3-4c76-abcb-64448d942ff1";
const GOLDEN_WORKER = "da75dbf31cafa1bd284319e07af48a113678890f488ce104934498e47176acd7";
const GOLDEN_BEARER = "sYlR2IUF6JvP7CoygPZRE33b9X9pc/MxQGXzZfQHNUU=";

const DISPLAY_FILES = [
  "src/app/layout.tsx",
  "src/components/app-shell.tsx",
  "src/components/auth-gate.tsx",
  "src/components/brand-stage.tsx",
  "src/components/operator-chrome.tsx",
  "src/components/operator-gate.tsx",
  "src/components/sidebar-nav.tsx",
  "src/components/fault-screen.tsx",
  "src/components/consent-screen.tsx",
  "src/lib/console-model.ts",
  "src/lib/login.ts",
  "src/lib/notify-device.ts",
  "src/lib/product.ts",
  "src/lib/study-client.ts",
  "public/manifest.webmanifest",
  "phone/ios/App/App/Info.plist",
];

function apiRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...apiRouteFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) {
      out.push(path);
    }
  }
  return out;
}

/** Quoted strings inside a NextResponse returned to the caller. Identifiers are not strings. */
function returnedApiStrings(source: string): string[] {
  const chunks: string[] = [];
  const reply = /return (?:new )?NextResponse(?:\.json)?\(([\s\S]*?)\);/g;
  let block: RegExpExecArray | null;
  while ((block = reply.exec(source))) chunks.push(block[1] ?? "");
  const out: string[] = [];
  const lit = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const chunk of chunks) {
    lit.lastIndex = 0;
    let quoted: RegExpExecArray | null;
    while ((quoted = lit.exec(chunk))) out.push(quoted[2] ?? "");
  }
  return out;
}

describe("Somnadia rename invariants", () => {
  it("frozen identities stay circadia, never somnadia", () => {
    expect(PRODUCT_NAME).toBe("Somnadia");
    expect(KEYCHAIN_SERVICE).toBe("Circadia");
    expect(STORAGE_KEY).toBe("circadia:v1");
    expect(VAULT_KEY).toBe("circadia:v1:files");
    expect(SESSION_KEY).toBe("circadia:v1:open");
    expect(LAST_LOGIN_KEY).toBe("circadia:v1:last-login");
    expect(LOCKS_KEY).toBe("circadia:v1:locks");
    expect(SESSION_UNLOCK_KEY).toBe("circadia:v1:unlock");
    expect(FOLDED_PACK_KEY).toBe("circadia:folded-pack");
    expect(FOLDED_INBOX_KEY).toBe("circadia:folded-inbox");
    expect(INVITE_DERIVE_PREFIX).toBe("circadia/invite/v1:");
    expect(INVITE_DERIVE_PREFIX_V2).toBe("circadia/invite/v2:");
    expect(PACK_ID_INFO).toBe("circadia/pack-id/v2");
    expect(PACK_AUTH_INFO).toBe("circadia/pack-auth/v2");
    expect(PACK_SEAL_LABEL).toBe("circadia/pack/v2");
    expect(CIRCADIA_SYNC_ORIGIN).toContain("circadia-sync");
    expect(CIRCADIA_SYNC_ORIGIN.startsWith("https://")).toBe(true);
    expect(CIRCADIA_SYNC_ORIGIN.toLowerCase()).not.toContain("somnadia");
    expect(readFileSync("src/lib/password.ts", "utf8")).toContain('const WRAP_INFO = "circadia/wrap/v1"');
    expect(readFileSync("src/lib/password.ts", "utf8")).toContain('const AUTH_INFO = "circadia/auth/v1"');
    expect(readFileSync("src/lib/sync-account.ts", "utf8")).toContain('const LOOKUP_PREFIX = "circadia/lookup/v1"');
    expect(readFileSync("phone/capacitor.config.ts", "utf8")).toContain('appId: "app.circadia.diary"');
    expect(readFileSync("phone/capacitor.config.ts", "utf8")).toContain('scheme: "Circadia"');
    expect(readFileSync("electron/native-bundle.cjs", "utf8")).toContain('bundleId: "app.circadia.desktop"');
    expect(readFileSync("electron/native-bundle.cjs", "utf8")).toContain('bundleId: "app.circadia.operator"');
    expect(readFileSync("electron/native-bundle.cjs", "utf8")).toContain('exec: "Circadia"');
    expect(readFileSync("electron/launcher.swift", "utf8")).toContain('private let service = "Circadia"');
    expect(readFileSync("src/lib/types.ts", "utf8")).toContain('schema: "circadia-study-v1"');
    expect(readFileSync("src/lib/types.ts", "utf8")).toContain('schema: "circadia-roster-v1"');
    expect(readFileSync("src/lib/types.ts", "utf8")).toContain('schema: "circadia-roster-v2"');
    expect(readFileSync("src/lib/types.ts", "utf8")).toContain('schema: "circadia-fault-v1"');
    expect(JSON.parse(readFileSync("package.json", "utf8")).name).toBe("circadia");
    expect(readFileSync("src/lib/mod-key-shared.ts", "utf8")).toMatch(/circadia-local/);
    const vault = vaultFilePath();
    if (process.platform === "darwin" && !process.env.CIRCADIA_VAULT_FILE) {
      expect(vault).toContain("/Library/Application Support/Circadia/vault.json");
      expect(vault).not.toContain("Somnadia");
    }
    const pinned = [
      KEYCHAIN_SERVICE,
      STORAGE_KEY,
      INVITE_DERIVE_PREFIX_V2,
      PACK_SEAL_LABEL,
      CIRCADIA_SYNC_ORIGIN,
    ];
    for (const value of pinned) {
      expect(value.toLowerCase()).toContain("circadia");
      expect(value.toLowerCase()).not.toContain("somnadia");
    }
  });

  it("the golden v2 invite still derives the recorded participant, worker id, and bearer", async () => {
    const normalized = normalizeInviteCodeV2(GOLDEN_CODE);
    expect(normalized).toBe("KT5EJ4C2W5HCPPRA");
    expect(await deriveInviteParticipantIdV2(normalized!)).toBe(GOLDEN_ID);
    const loc = await derivePackLocation(normalized!);
    expect(loc.workerId).toBe(GOLDEN_WORKER);
    expect(loc.bearer).toBe(GOLDEN_BEARER);
  });

  it("display surfaces contain no whole-word Circadia", () => {
    expect(PRODUCT_NAME).toBe("Somnadia");
    expect(OPERATOR_PRODUCT_NAME).toBe("Somnadia Operator");
    const word = /\bCircadia\b/;
    for (const file of DISPLAY_FILES) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(word);
    }
    const sample =
      'function useCircadia() {\n  type CircadiaSafeTree = never;\n  return NextResponse.json({ error: "Not found." });\n}';
    expect(returnedApiStrings(sample)).toEqual(["Not found."]);
    expect(returnedApiStrings(sample).join("\n")).not.toMatch(word);
    for (const file of apiRouteFiles("src/app/api")) {
      const hits = returnedApiStrings(readFileSync(file, "utf8")).filter((s) => word.test(s));
      expect(hits, file).toEqual([]);
    }
    expect(readFileSync("phone/ios/App/App/SceneDelegate.swift", "utf8")).toContain('string: "Somnadia"');
    expect(readFileSync("phone/ios/App/App/Info.plist", "utf8")).toContain("<string>Somnadia</string>");
    expect(readFileSync("electron/native-bundle.cjs", "utf8")).toContain('display: "Somnadia"');
    expect(readFileSync("electron/native-bundle.cjs", "utf8")).toContain('fileName: "Somnadia.app"');
  });

  it("circadian is untouched", () => {
    const word = /\bcircadian\b/gi;
    const count = CIRCADIAN_FILES.reduce((sum, file) => {
      return sum + (readFileSync(file, "utf8").match(word)?.length ?? 0);
    }, 0);
    expect(count).toBe(CIRCADIAN_BEFORE);
  });

  it("put-on-dock does not remove or move Circadia.app", () => {
    const scripts = [
      readFileSync("scripts/put-on-dock.sh", "utf8"),
      readFileSync("electron/install-both-native.cjs", "utf8"),
      readFileSync("electron/native-bundle.cjs", "utf8"),
      readFileSync("electron/rebuild-launcher.cjs", "utf8"),
    ].join("\n");
    expect(scripts).not.toMatch(/rm\s+(-[a-zA-Z]+\s+)*["']?\/Applications\/Circadia\.app/);
    expect(scripts).not.toMatch(/rmSync\([^)]*Circadia\.app/);
    expect(scripts).not.toMatch(/unlinkSync\([^)]*Circadia\.app/);
    expect(scripts).not.toMatch(/\bmv\b[^;\n]*Circadia\.app/);
    expect(scripts).not.toMatch(/renameSync\([^)]*Circadia\.app/);
    expect(readFileSync("electron/install-both-native.cjs", "utf8")).toContain(
      "Circadia.app and Circadia Operator.app are still installed if they were.",
    );
  });
});
