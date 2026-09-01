import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PACKED_DIARY_HREF } from "./packed-diary";
import { TABS } from "./nav";
import {
  LAST_LOGIN_KEY,
  VAULT_KEY,
  applyPackedDiaryIfEmpty,
  bootVaultFromDisk,
  closeFile,
  createFile,
  foldLockedVaultIntoSession,
  flushVaultWrites,
  getSessionLogin,
  isVaultEmpty,
  loadState,
  pushVaultToDisk,
  resetVaultMemoryForTests,
  saveState,
  setVaultPauseForTests,
  snapshotDisk,
} from "./storage";
import { setPhoneVaultIoForTests } from "./phone-vault";

const PASS = "correct-horse";
const creds = { password: PASS, confirm: PASS };
const LOGIN = "email:ada@example.com";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

describe("stay signed in across diary tabs", () => {
  let sessionKeys: Map<string, string>;

  beforeEach(() => {
    resetVaultMemoryForTests();
    setVaultPauseForTests(async () => undefined);
    sessionKeys = new Map();
    const mem = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: mem, configurable: true });
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://127.0.0.1");
      if (url.pathname === PACKED_DIARY_HREF || url.pathname.endsWith("/circadia-locked.json")) {
        return new Response("", { status: 404 });
      }
      if (url.pathname === "/api/session-key") {
        const method = (init?.method ?? "GET").toUpperCase();
        if (method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { login?: string; master?: string };
          if (typeof body.login === "string" && typeof body.master === "string") {
            sessionKeys.set(body.login, body.master);
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
          return new Response(JSON.stringify({ ok: false }), { status: 400 });
        }
        if (method === "GET") {
          const login = url.searchParams.get("login") ?? "";
          const master = sessionKeys.get(login);
          if (!master) return new Response(JSON.stringify({ ok: false }), { status: 404 });
          return new Response(JSON.stringify({ ok: true, login, master }), { status: 200 });
        }
        if (method === "DELETE") {
          const login = url.searchParams.get("login") ?? "";
          sessionKeys.delete(login);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
      }
      return new Response(JSON.stringify({ v: 1, files: {}, locks: {}, session: null }), { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    resetVaultMemoryForTests();
    setPhoneVaultIoForTests(null);
    localStorage.clear();
  });

  async function signIn(): Promise<void> {
    const created = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    created.state.researchNotes = "nights still here";
    created.state.profile = {
      ...created.state.profile!,
      onboardingComplete: true,
    };
    saveState(created.state);
    await flushVaultWrites();
  }

  it("does not drop a live unlock when boot runs again (provider remount)", async () => {
    await signIn();
    expect(getSessionLogin()).toBe(LOGIN);
    await bootVaultFromDisk();
    await bootVaultFromDisk();
    expect(getSessionLogin()).toBe(LOGIN);
    expect(loadState().researchNotes).toBe("nights still here");
  });

  it("does not ask for the password after five tab-sized process deaths", async () => {
    await signIn();
    expect(TABS).toHaveLength(5);
    for (const tab of TABS) {
      resetVaultMemoryForTests();
      setVaultPauseForTests(async () => undefined);
      expect(getSessionLogin(), tab.href).toBeNull();
      await bootVaultFromDisk();
      expect(getSessionLogin(), tab.label).toBe(LOGIN);
      expect(loadState().researchNotes, tab.label).toBe("nights still here");
    }
  });

  it("logs out only when closeFile runs, not when the shell remounts", async () => {
    await signIn();
    await bootVaultFromDisk();
    expect(getSessionLogin()).toBe(LOGIN);
    await closeFile();
    expect(getSessionLogin()).toBeNull();
    resetVaultMemoryForTests();
    setVaultPauseForTests(async () => undefined);
    await bootVaultFromDisk();
    expect(getSessionLogin()).toBeNull();
  });

  it("folds a locked copy into the open diary without asking for the password", async () => {
    await signIn();
    const live = loadState();
    live.reports = [
      {
        id: "n1",
        morningDate: "2026-09-01",
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
        createdAt: "2026-09-01T12:00:00.000Z",
      },
    ];
    saveState(live);
    await flushVaultWrites();
    const packed = snapshotDisk();
    const wiped = loadState();
    wiped.reports = [];
    wiped.researchNotes = "cleared";
    saveState(wiped);
    await flushVaultWrites();
    expect(loadState().reports).toHaveLength(0);
    const folded = await foldLockedVaultIntoSession(packed);
    expect(folded.ok).toBe(true);
    if (!folded.ok) return;
    expect(getSessionLogin()).toBe(LOGIN);
    expect(folded.added).toBe(1);
    expect(loadState().reports[0]?.morningDate).toBe("2026-09-01");
    expect(loadState().researchNotes).toBe("nights still here");
  });
});

describe("stay signed in on a phone document load", () => {
  let disk = "";
  let keys: Map<string, string>;
  let deletes: string[];
  let getCount: number;
  let missGets: number;
  let diskReads: number;
  let diskUnavailableReads: number;

  beforeEach(() => {
    resetVaultMemoryForTests();
    setVaultPauseForTests(async () => undefined);
    disk = "";
    keys = new Map();
    deletes = [];
    getCount = 0;
    missGets = 0;
    diskReads = 0;
    diskUnavailableReads = 0;
    const mem = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: mem, configurable: true });
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://127.0.0.1");
      if (url.pathname === PACKED_DIARY_HREF || url.pathname.endsWith("/circadia-locked.json")) {
        return new Response(
          JSON.stringify({
            kind: "circadia.locked-diary",
            v: 1,
            vault: {
              v: 1,
              files: { "email:packed@example.com": { enc: true, v: 1, iv: "YQ==", ct: "Yg==" } },
              locks: {},
              session: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    setPhoneVaultIoForTests({
      native: () => true,
      readFile: async () => {
        diskReads += 1;
        if (diskReads <= diskUnavailableReads) return { status: "unavailable" };
        return disk || null;
      },
      writeFile: async (data) => {
        disk = data;
      },
      secureGet: async (account) => {
        getCount += 1;
        if (getCount <= missGets) return null;
        return keys.get(account) ?? null;
      },
      secureSet: async (account, value) => {
        keys.set(account, value);
        return true;
      },
      secureDelete: async (account) => {
        deletes.push(account);
        keys.delete(account);
      },
    });
  });

  afterEach(() => {
    setPhoneVaultIoForTests(null);
    resetVaultMemoryForTests();
  });

  async function signInPhone(): Promise<void> {
    const created = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    created.state.researchNotes = "phone nights";
    saveState(created.state);
    await flushVaultWrites();
    await pushVaultToDisk();
  }

  it("retries a cold keychain miss instead of sending the user to the gate", async () => {
    await signInPhone();
    expect(keys.get(LOGIN)?.length).toBeGreaterThan(8);
    resetVaultMemoryForTests();
    setVaultPauseForTests(async () => undefined);
    getCount = 0;
    missGets = 2;
    expect(getSessionLogin()).toBeNull();
    await bootVaultFromDisk();
    expect(getSessionLogin()).toBe(LOGIN);
    expect(loadState().researchNotes).toBe("phone nights");
    expect(getCount).toBeGreaterThanOrEqual(3);
  });

  it("does not burn the keychain when ciphertext has not loaded yet", async () => {
    await signInPhone();
    const master = keys.get(LOGIN);
    expect(master).toBeTruthy();
    resetVaultMemoryForTests();
    setVaultPauseForTests(async () => undefined);
    disk = "";
    localStorage.removeItem(VAULT_KEY);
    expect(JSON.parse(localStorage.getItem(LAST_LOGIN_KEY) ?? "null")).toEqual({ login: LOGIN });
    getCount = 0;
    missGets = 0;
    await bootVaultFromDisk();
    expect(JSON.parse(localStorage.getItem(LAST_LOGIN_KEY) ?? "null")).toEqual({ login: LOGIN });
    expect(deletes).toEqual([]);
    expect(keys.get(LOGIN)).toBe(master);
    expect(getSessionLogin()).toBeNull();
  });

  it("does not install a packed diary over a last-login that is still catching up", async () => {
    localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ login: LOGIN }));
    expect(await applyPackedDiaryIfEmpty()).toBe(false);
    expect(isVaultEmpty()).toBe(true);
  });

  it("restores from disk after the first plugin reads miss a document load", async () => {
    await signInPhone();
    const saved = disk;
    expect(saved.length).toBeGreaterThan(10);
    resetVaultMemoryForTests();
    setVaultPauseForTests(async () => undefined);
    localStorage.clear();
    disk = saved;
    diskReads = 0;
    diskUnavailableReads = 2;
    getCount = 0;
    missGets = 0;
    await bootVaultFromDisk();
    expect(getSessionLogin()).toBe(LOGIN);
    expect(loadState().researchNotes).toBe("phone nights");
  });

  it("does not clobber a live phone unlock when boot runs again", async () => {
    await signInPhone();
    await bootVaultFromDisk();
    expect(getSessionLogin()).toBe(LOGIN);
    await bootVaultFromDisk();
    expect(getSessionLogin()).toBe(LOGIN);
    expect(deletes).toEqual([]);
  });
});
