import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseLockedDiary, serializeLockedDiary } from "./diary-pack";
import { fetchPackedDiary, PACKED_DIARY_HREF, readInlinePackedDiary, resetPackedDiaryCacheForTests } from "./packed-diary";
import {
  absorbPeerNights,
  applyPackedDiaryIfEmpty,
  closeFile,
  createFile,
  eraseCurrentFile,
  flushVaultWrites,
  FOLDED_PACK_KEY,
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
import type { MorningReport } from "./types";

const PASS = "correct-horse";
const creds = { password: PASS, confirm: PASS };

function night(morningDate: string, createdAt: string): MorningReport {
  return {
    id: `n-${morningDate}`,
    morningDate,
    wokeAt: "07:00",
    fellAsleepAt: "23:00",
    rating: 3,
    drank: false,
    screenOffMinutes: 60,
    sleepLatencyMinutes: 15,
    wokeInNight: false,
    nightWakingMinutes: 0,
    usedSupplement: false,
    windDownHelped: "did_not_use",
    createdAt,
  };
}

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
  it("does not pack when required as a library", () => {
    const require = createRequire(import.meta.url);
    const mod = require("../../scripts/pack-mac-diary.cjs") as { pickVault: (root: string) => unknown };
    expect(typeof mod.pickVault).toBe("function");
  });

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

  it("inlines the pack into index.html so WKWebView does not have to fetch", () => {
    const root = mkdtempSync(join(tmpdir(), "circadia-pack-inline-"));
    const outDir = join(root, "out");
    mkdirSync(outDir);
    writeFileSync(join(outDir, "index.html"), "<!doctype html><html><head></head><body></body></html>");
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
    const html = readFileSync(join(outDir, "index.html"), "utf8");
    expect(html).toContain('__CIRCADIA_PACK_STATUS__="packed"');
    expect(html).toContain("__CIRCADIA_LOCKED_DIARY__");
    expect(html).toContain("circadia.locked-diary");
    expect(html).toContain("<!--circadia-locked-diary-->");
    rmSync(root, { recursive: true, force: true });
  });

  it("exits 8 when the Mac vault is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "circadia-pack-empty-"));
    mkdirSync(join(root, "out"));
    const run = spawnSync(process.execPath, [join(process.cwd(), "scripts/pack-mac-diary.cjs")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CIRCADIA_VAULT_FILE: join(root, "nope.json") },
    });
    expect(run.status).toBe(8);
    expect(run.stderr).toMatch(/No locked diary/);
    rmSync(root, { recursive: true, force: true });
  });

  it("writes an empty pack marker when --allow-empty", () => {
    const root = mkdtempSync(join(tmpdir(), "circadia-pack-allow-"));
    const outDir = join(root, "out");
    mkdirSync(outDir);
    writeFileSync(join(outDir, "index.html"), "<html><head></head></html>");
    const run = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/pack-mac-diary.cjs"), "--allow-empty"],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CIRCADIA_VAULT_FILE: join(root, "nope.json") },
      },
    );
    expect(run.status).toBe(0);
    const html = readFileSync(join(outDir, "index.html"), "utf8");
    expect(html).toContain('__CIRCADIA_PACK_STATUS__="empty"');
    rmSync(root, { recursive: true, force: true });
  });

  it("does not overwrite an already packed index.html when --allow-empty", () => {
    const root = mkdtempSync(join(tmpdir(), "circadia-pack-keep-"));
    const outDir = join(root, "out");
    const iosPublic = join(root, "ios-public");
    mkdirSync(outDir);
    mkdirSync(iosPublic);
    const packed =
      '<html><head><!--circadia-locked-diary-->\n<script>window.__CIRCADIA_PACK_STATUS__="packed";window.__CIRCADIA_LOCKED_DIARY__={"kind":"circadia.locked-diary"};</script>\n<!--/circadia-locked-diary--></head></html>';
    writeFileSync(join(outDir, "index.html"), packed);
    writeFileSync(join(iosPublic, "index.html"), packed);
    const run = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/pack-mac-diary.cjs"), "--allow-empty", "--ios-public", iosPublic],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CIRCADIA_VAULT_FILE: join(root, "nope.json") },
      },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/Left the locked diary/);
    expect(readFileSync(join(outDir, "index.html"), "utf8")).toContain('__CIRCADIA_PACK_STATUS__="packed"');
    expect(readFileSync(join(iosPublic, "index.html"), "utf8")).toContain('__CIRCADIA_PACK_STATUS__="packed"');
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
    delete (window as Window & { __CIRCADIA_LOCKED_DIARY__?: unknown }).__CIRCADIA_LOCKED_DIARY__;
    delete (window as Window & { __CIRCADIA_PACK_STATUS__?: unknown }).__CIRCADIA_PACK_STATUS__;
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

  it("logs in from the inline index.html pack without fetch", async () => {
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
    mockPacked(null);
    window.__CIRCADIA_PACK_STATUS__ = "packed";
    window.__CIRCADIA_LOCKED_DIARY__ = { kind: "circadia.locked-diary", v: 1, vault };
    resetPackedDiaryCacheForTests();
    expect(readInlinePackedDiary()?.files["email:ada@example.com"]).toBeTruthy();

    const opened = await openFile("ada@example.com", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.researchNotes).toBe("nights from the Mac");
  });
});

describe("packed diary into a phone that already filed a morning", () => {
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
    delete (window as Window & { __CIRCADIA_LOCKED_DIARY__?: unknown }).__CIRCADIA_LOCKED_DIARY__;
    delete (window as Window & { __CIRCADIA_PACK_STATUS__?: unknown }).__CIRCADIA_PACK_STATUS__;
  });

  it("keeps Sep 1 on the phone and folds Aug 31 from the packed Mac diary", async () => {
    const started = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    started.state.reports = [night("2026-08-31", "2026-08-31T12:00:00.000Z")];
    started.state.researchNotes = "aug 31 on the Mac";
    saveState(started.state);
    await flushVaultWrites();
    const packed = parseLockedDiary(serializeLockedDiary(snapshotDisk()));
    expect(packed).not.toBeNull();
    if (!packed) return;

    const phone = loadState();
    phone.reports = [night("2026-09-01", "2026-09-01T12:00:00.000Z")];
    phone.researchNotes = "sep 1 on the phone";
    saveState(phone);
    await flushVaultWrites();
    await closeFile();

    mockPacked(packed);
    const opened = await openFile("ada@example.com", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.reports.map((row) => row.morningDate).sort()).toEqual(["2026-08-31", "2026-09-01"]);
    expect(loadState().reports.map((row) => row.morningDate).sort()).toEqual(["2026-08-31", "2026-09-01"]);
    expect(localStorage.getItem(FOLDED_PACK_KEY)).toBeTruthy();

    const again = await absorbPeerNights();
    expect(again.added).toBe(0);
    expect(loadState().reports.map((row) => row.morningDate).sort()).toEqual(["2026-08-31", "2026-09-01"]);
  });

  it("does not replace a leftover morning when the packed diary is a different lock", async () => {
    const mac = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(mac.ok).toBe(true);
    if (!mac.ok) return;
    mac.state.reports = [night("2026-08-31", "2026-08-31T12:00:00.000Z")];
    saveState(mac.state);
    await flushVaultWrites();
    const packed = parseLockedDiary(serializeLockedDiary(snapshotDisk()));
    expect(packed).not.toBeNull();
    if (!packed) return;

    eraseCurrentFile();
    const leftover = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(leftover.ok).toBe(true);
    if (!leftover.ok) return;
    leftover.state.reports = [night("2026-09-01", "2026-09-01T12:00:00.000Z")];
    leftover.state.researchNotes = "keep the phone morning";
    saveState(leftover.state);
    await flushVaultWrites();
    await closeFile();

    mockPacked(packed);
    const opened = await openFile("ada@example.com", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.reports.map((row) => row.morningDate)).toEqual(["2026-09-01"]);
    expect(opened.state.researchNotes).toBe("keep the phone morning");
  });
});

describe("absorb peer nights from the Mac fold inbox", () => {
  const previousFetch = globalThis.fetch;

  beforeEach(() => {
    resetVaultMemoryForTests();
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
  });

  afterEach(() => {
    resetVaultMemoryForTests();
    globalThis.fetch = previousFetch;
  });

  it("folds a USB inbox morning into the open Dock diary and consumes only the inbox", async () => {
    const started = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    started.state.reports = [night("2026-09-01", "2026-09-01T12:00:00.000Z")];
    saveState(started.state);
    await flushVaultWrites();
    const inboxVault = parseLockedDiary(serializeLockedDiary(snapshotDisk()));
    expect(inboxVault).not.toBeNull();
    if (!inboxVault) return;

    const dock = loadState();
    dock.reports = [night("2026-08-31", "2026-08-31T12:00:00.000Z")];
    saveState(dock);
    await flushVaultWrites();

    let consumed = 0;
    let postedSource: unknown = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1");
      if (url.pathname === PACKED_DIARY_HREF || url.pathname.endsWith("/circadia-locked.json")) {
        return new Response("", { status: 404 });
      }
      if (url.pathname === "/api/fold-inbox") {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST") {
          consumed += 1;
          postedSource = JSON.parse(String(init?.body ?? "{}")) as { source?: unknown };
          return new Response(JSON.stringify({ ok: true, consumed: true }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            source: "inbox",
            digest: "usb-sep1",
            vault: inboxVault,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    resetPackedDiaryCacheForTests();

    const folded = await absorbPeerNights();
    expect(folded.added).toBe(1);
    expect(loadState().reports.map((row) => row.morningDate).sort()).toEqual(["2026-08-31", "2026-09-01"]);
    expect(consumed).toBe(1);
    expect(postedSource).toEqual({ source: "inbox" });

    const again = await absorbPeerNights();
    expect(again.added).toBe(0);
    expect(consumed).toBe(1);
  });
});
