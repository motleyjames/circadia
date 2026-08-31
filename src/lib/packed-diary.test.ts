import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseLockedDiary, serializeLockedDiary } from "./diary-pack";
import { fetchPackedDiary, PACKED_DIARY_HREF, resetPackedDiaryCacheForTests } from "./packed-diary";
import {
  applyPackedDiaryIfEmpty,
  closeFile,
  createFile,
  eraseCurrentFile,
  flushVaultWrites,
  isVaultEmpty,
  loadState,
  openFile,
  resetVaultMemoryForTests,
  saveState,
  snapshotDisk,
} from "./storage";
import { setPhoneVaultIoForTests } from "./phone-vault";
import { AUTH_ERRORS } from "./login";
import type { DiskVault } from "./vault";

const PASS = "correct-horse";
const creds = { password: PASS, confirm: PASS };

function mockPacked(vault: DiskVault | null): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://127.0.0.1");
    if (url.pathname === PACKED_DIARY_HREF || url.pathname.endsWith("/circadia-locked.json")) {
      if (!vault) return new Response("", { status: 404 });
      return new Response(JSON.stringify({ kind: "circadia.locked-diary", v: 1, vault }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  resetPackedDiaryCacheForTests();
}

describe("pack-mac-diary", () => {
  it("writes a locked pack from a vault.json and strips session", () => {
    const root = mkdtempSync(join(tmpdir(), "circadia-pack-mac-"));
    const outDir = join(root, "out");
    mkdirSync(outDir);
    const vault = join(root, "vault.json");
    writeFileSync(
      vault,
      JSON.stringify({
        v: 1,
        files: { "email:ada@example.com": { enc: true } },
        locks: { "email:ada@example.com": { v: 2, salt: "YQ==", hash: "Yg==" } },
        session: "email:ada@example.com",
      }),
    );
    const run = spawnSync(process.execPath, [join(process.cwd(), "scripts/pack-mac-diary.cjs")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CIRCADIA_VAULT_FILE: vault },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/Packed the locked diary/);
    expect(run.stdout).not.toMatch(/ada@example.com/);
    const pack = JSON.parse(readFileSync(join(outDir, "circadia-locked.json"), "utf8"));
    expect(pack.kind).toBe("circadia.locked-diary");
    const parsed = parseLockedDiary(pack);
    expect(parsed?.session).toBeNull();
    expect(parsed?.files["email:ada@example.com"]).toEqual({ enc: true });
    rmSync(root, { recursive: true, force: true });
  });

  it("exits 0 with no dest file when the Mac vault is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "circadia-pack-empty-"));
    mkdirSync(join(root, "out"));
    const run = spawnSync(process.execPath, [join(process.cwd(), "scripts/pack-mac-diary.cjs")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CIRCADIA_VAULT_FILE: join(root, "nope.json") },
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/No Mac diary/);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("packed diary on an empty phone", () => {
  let disk = "";
  const previousFetch = globalThis.fetch;

  beforeEach(() => {
    resetVaultMemoryForTests();
    disk = "";
    const mem = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
        setItem: (k: string, v: string) => mem.set(k, String(v)),
        removeItem: (k: string) => mem.delete(k),
        clear: () => mem.clear(),
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    setPhoneVaultIoForTests({
      native: () => true,
      readFile: async () => disk || null,
      writeFile: async (data) => {
        disk = data;
      },
      secureGet: async () => null,
      secureSet: async () => true,
      secureDelete: async () => {},
    });
    mockPacked(null);
  });

  afterEach(() => {
    setPhoneVaultIoForTests(null);
    resetVaultMemoryForTests();
    globalThis.fetch = previousFetch;
  });

  it("installs a packed locked diary without unlocking it", async () => {
    mockPacked({
      v: 1,
      files: { "email:ada@example.com": { enc: true, v: 1, iv: "YQ==", ct: "Yg==" } },
      locks: {},
      session: "email:ada@example.com",
    });

    expect(isVaultEmpty()).toBe(true);
    expect(await applyPackedDiaryIfEmpty()).toBe(true);
    expect(isVaultEmpty()).toBe(false);
    const packed = await fetchPackedDiary();
    expect(packed?.session).toBeNull();
    expect(await openFile("ada@example.com", "wrong-password")).toEqual({
      ok: false,
      error: AUTH_ERRORS.credentials,
    });
  });

  it("logs in with Mac credentials even when this phone already signed up someone else", async () => {
    const mac = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(mac.ok).toBe(true);
    if (!mac.ok) return;
    mac.state.researchNotes = "nights from the Mac";
    saveState(mac.state);
    await flushVaultWrites();
    const packed = serializeLockedDiary(snapshotDisk());
    const vault = parseLockedDiary(packed);
    expect(vault).not.toBeNull();
    if (!vault) return;

    eraseCurrentFile();
    const phone = await createFile({
      firstName: "Phone",
      lastName: "Signup",
      contact: "phone@example.com",
      ...creds,
    });
    expect(phone.ok).toBe(true);
    if (!phone.ok) return;
    phone.state.researchNotes = "empty phone signup";
    saveState(phone.state);
    await flushVaultWrites();
    await closeFile();

    mockPacked(vault);
    const opened = await openFile("ada@example.com", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.researchNotes).toBe("nights from the Mac");
    expect(loadState().researchNotes).toBe("nights from the Mac");
  });

  it("opens the packed diary when the leftover signup used the same email", async () => {
    const mac = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(mac.ok).toBe(true);
    if (!mac.ok) return;
    mac.state.researchNotes = "mac nights, not the phone signup";
    saveState(mac.state);
    await flushVaultWrites();
    const vault = parseLockedDiary(serializeLockedDiary(snapshotDisk()));
    expect(vault).not.toBeNull();
    if (!vault) return;

    eraseCurrentFile();
    const leftover = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(leftover.ok).toBe(true);
    if (!leftover.ok) return;
    leftover.state.researchNotes = "phone signup with no nights";
    saveState(leftover.state);
    await flushVaultWrites();
    await closeFile();

    mockPacked(vault);
    const opened = await openFile("ada@example.com", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.researchNotes).toBe("mac nights, not the phone signup");
  });

  it("does not replace the phone diary when the packed password is wrong", async () => {
    const mac = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(mac.ok).toBe(true);
    if (!mac.ok) return;
    mac.state.researchNotes = "mac nights";
    saveState(mac.state);
    await flushVaultWrites();
    const vault = parseLockedDiary(serializeLockedDiary(snapshotDisk()));
    expect(vault).not.toBeNull();
    if (!vault) return;

    eraseCurrentFile();
    const phonePass = "phone-horse-battery";
    const phone = await createFile({
      firstName: "Phone",
      lastName: "Signup",
      contact: "phone@example.com",
      password: phonePass,
      confirm: phonePass,
    });
    expect(phone.ok).toBe(true);
    if (!phone.ok) return;
    phone.state.researchNotes = "keep the phone nights";
    saveState(phone.state);
    await flushVaultWrites();
    await closeFile();

    mockPacked(vault);
    expect(await openFile("ada@example.com", "wrong-horse")).toEqual({
      ok: false,
      error: AUTH_ERRORS.missing,
    });
    const stillPhone = await openFile("phone@example.com", phonePass);
    expect(stillPhone.ok).toBe(true);
    if (!stillPhone.ok) return;
    expect(stillPhone.state.researchNotes).toBe("keep the phone nights");
  });

  it("opens the only packed diary when the leftover signup used a different email", async () => {
    const mac = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(mac.ok).toBe(true);
    if (!mac.ok) return;
    mac.state.researchNotes = "nights from the Mac";
    saveState(mac.state);
    await flushVaultWrites();
    const vault = parseLockedDiary(serializeLockedDiary(snapshotDisk()));
    expect(vault).not.toBeNull();
    if (!vault) return;

    eraseCurrentFile();
    const leftover = await createFile({
      firstName: "Phone",
      lastName: "Signup",
      contact: "phone@example.com",
      password: "phone-horse-battery",
      confirm: "phone-horse-battery",
    });
    expect(leftover.ok).toBe(true);
    if (!leftover.ok) return;
    await closeFile();

    mockPacked(vault);
    const opened = await openFile("phone@example.com", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.researchNotes).toBe("nights from the Mac");
  });
});
