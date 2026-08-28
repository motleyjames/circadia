import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64, newPasswordLock } from "./password";
import { AUTH_ERRORS, LOCAL_FILE_KEY, defaultAuthMode, defaultContactField, identitiesFromVaultKeys, loginKeyCandidates, loginKeyFromInput, loginKeyFromProfile } from "./login";
import {
  LAST_LOGIN_KEY,
  LOCKS_KEY,
  SESSION_KEY,
  STORAGE_KEY,
  VAULT_KEY,
  attachLoginToCurrent,
  bootVaultFromDisk,
  changePassword,
  closeFile,
  createFile,
  eraseCurrentFile,
  getSessionLogin,
  hydrateState,
  loadState,
  migrateToVault,
  openFile,
  resetVaultMemoryForTests,
  saveState,
} from "./storage";

const PASS = "correct-horse";
const NEXT_PASS = "new-correct-horse";
const creds = { password: PASS, confirm: PASS };

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

describe("login keys", () => {
  it("normalizes email and phone to stable vault keys", () => {
    expect(loginKeyFromInput("James@Colorado.EDU")).toBe("email:james@colorado.edu");
    expect(loginKeyFromInput("303-555-0142")).toBe("phone:3035550142");
    expect(loginKeyFromInput("(303) 555-0142")).toBe("phone:3035550142");
    expect(loginKeyFromInput("+1 303-555-0142")).toBe("phone:3035550142");
    expect(loginKeyFromInput("1-303-555-0142")).toBe("phone:3035550142");
    expect(loginKeyFromInput("James Motley <jbmotley06@icloud.com>")).toBe("email:jbmotley06@icloud.com");
    expect(loginKeyFromInput("James Motley jbmotley06@icloud.com")).toBe("email:jbmotley06@icloud.com");
    expect(loginKeyFromInput("not-an-id")).toBeNull();
    expect(loginKeyCandidates("303-555-0142")).toContain("phone:13035550142");
  });

  it("defaults the gate to log in when a named diary already exists", () => {
    const named = identitiesFromVaultKeys(["email:jbmotley06@icloud.com"]);
    expect(defaultAuthMode(named)).toBe("login");
    expect(defaultContactField(named)).toBe("jbmotley06@icloud.com");
    expect(defaultAuthMode(identitiesFromVaultKeys([LOCAL_FILE_KEY]))).toBe("signup");
  });

  it("prefers email on a profile when both exist", () => {
    expect(
      loginKeyFromProfile({ email: "james@colorado.edu", phone: "3035550142" }),
    ).toBe("email:james@colorado.edu");
    expect(loginKeyFromProfile({ email: "", phone: "303-555-0142" })).toBe("phone:3035550142");
    expect(loginKeyFromProfile({ email: "", phone: "" })).toBeNull();
  });
});

describe("local file vault", () => {
  beforeEach(() => {
    resetVaultMemoryForTests();
    const mem = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: mem, configurable: true });
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ v: 1, files: {}, locks: {}, session: null }), { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    resetVaultMemoryForTests();
    localStorage.clear();
  });

  it("migrates a named file into the vault without auto-opening it", async () => {
    const prior = hydrateState({
      profile: {
        onboardingComplete: true,
        name: "James Motley",
        age: 19,
        heightCm: 180,
        weightKg: 75,
        targetSleep: "23:30",
        targetWake: "07:30",
        email: "james@colorado.edu",
      },
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prior));
    migrateToVault();
    expect(getSessionLogin()).toBeNull();
    const opened = await openFile("james@colorado.edu", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.profile?.name).toBe("James Motley");
  });

  it("does not auto-open an empty legacy blob", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile: null, reports: [] }));
    migrateToVault();
    expect(getSessionLogin()).toBeNull();
    expect(JSON.parse(localStorage.getItem(VAULT_KEY) ?? "{}")).toEqual({});
  });

  it("creates a file, encrypts it, and does not unlock from a leftover session key", async () => {
    const created = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.state.profile?.onboardingComplete).toBe(false);
    expect(created.state.profile?.firstName).toBe("Ada");
    expect(getSessionLogin()).toBe("email:ada@example.com");
    expect(JSON.stringify(localStorage.getItem(LOCKS_KEY))).not.toMatch(/correct-horse/);
    expect(JSON.stringify(localStorage.getItem(VAULT_KEY))).not.toMatch(/Ada Lovelace/);

    created.state.researchNotes = "keep me";
    saveState(created.state);
    await closeFile();
    expect(getSessionLogin()).toBeNull();
    expect(loadState().profile).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(JSON.stringify(localStorage.getItem(VAULT_KEY))).not.toMatch(/keep me/);
    const sealed = JSON.parse(localStorage.getItem(VAULT_KEY) ?? "{}")["email:ada@example.com"] as { enc?: boolean };
    expect(sealed.enc).toBe(true);

    expect(await openFile("ADA@example.com", "wrong-horse")).toEqual({
      ok: false,
      error: AUTH_ERRORS.credentials,
    });
    const opened = await openFile("ADA@example.com", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.researchNotes).toBe("keep me");
    expect(opened.state.profile?.lastName).toBe("Lovelace");

    await closeFile();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ login: "email:ada@example.com" }));
    await bootVaultFromDisk();
    expect(getSessionLogin()).toBeNull();
    expect(loadState().researchNotes).toBe("");
  });

  it("refuses a second file for the same login and a missing login", async () => {
    expect(
      await createFile({ firstName: "A", lastName: "", contact: "a@example.com", ...creds }),
    ).toEqual({
      ok: false,
      error: AUTH_ERRORS.name,
    });
    const first = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "303-555-0199",
      ...creds,
    });
    expect(first.ok).toBe(true);
    await closeFile();
    expect(
      await createFile({ firstName: "Ada", lastName: "Lovelace", contact: "3035550199", ...creds }),
    ).toEqual({
      ok: false,
      error: AUTH_ERRORS.exists,
    });
    expect(await openFile("nobody@example.com", PASS)).toEqual({
      ok: false,
      error: AUTH_ERRORS.missing,
    });
  });

  it("create file claims an orphan local diary instead of wiping it", async () => {
    localStorage.setItem(
      VAULT_KEY,
      JSON.stringify({
        [LOCAL_FILE_KEY]: hydrateState({
          profile: {
            onboardingComplete: true,
            firstName: "you",
            lastName: "",
            age: 19,
            heightCm: 180,
            weightKg: 75,
            targetSleep: "23:00",
            targetWake: "07:00",
          },
          researchNotes: "keep the nights",
        }),
      }),
    );
    const claimed = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(claimed.state.researchNotes).toBe("keep the nights");
    expect(claimed.state.profile?.firstName).toBe("Ada");
    expect(claimed.state.profile?.onboardingComplete).toBe(true);
    expect(JSON.parse(localStorage.getItem(VAULT_KEY) ?? "{}")[LOCAL_FILE_KEY]).toBeUndefined();
    expect(JSON.stringify(localStorage.getItem(VAULT_KEY))).not.toMatch(/keep the nights/);
  });

  it("erase removes the current file; attachLogin rekeys and re-encrypts", async () => {
    const created = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(created.ok).toBe(true);
    eraseCurrentFile();
    expect(getSessionLogin()).toBeNull();
    expect(await openFile("ada@example.com", PASS)).toEqual({
      ok: false,
      error: AUTH_ERRORS.missing,
    });

    const again = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    again.state.researchNotes = "rekeyed notes";
    saveState(again.state);
    const attached = await attachLoginToCurrent("303-555-0100", PASS, PASS);
    expect(attached.ok).toBe(true);
    if (!attached.ok) return;
    expect(attached.login).toBe("phone:3035550100");
    expect(getSessionLogin()).toBe("phone:3035550100");
    expect(JSON.parse(localStorage.getItem(VAULT_KEY) ?? "{}")["email:ada@example.com"]).toBeUndefined();
    await closeFile();
    expect(JSON.stringify(localStorage.getItem(VAULT_KEY))).not.toMatch(/rekeyed notes/);
    const opened = await openFile("303-555-0100", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.researchNotes).toBe("rekeyed notes");
  });

  it("opens with a +1 phone and a pasted email, and names a missing diary honestly", async () => {
    const created = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "303-555-0142",
      ...creds,
    });
    expect(created.ok).toBe(true);
    await closeFile();
    const byCountry = await openFile("+1 (303) 555-0142", PASS);
    expect(byCountry.ok).toBe(true);

    const mail = await createFile({
      firstName: "James",
      lastName: "Motley",
      contact: "jbmotley06@icloud.com",
      ...creds,
    });
    expect(mail.ok).toBe(true);
    await closeFile();
    const pasted = await openFile("James Motley <jbmotley06@icloud.com>", PASS);
    expect(pasted.ok).toBe(true);

    expect(await openFile("nobody@example.com", PASS)).toEqual({
      ok: false,
      error: AUTH_ERRORS.missing,
    });
  });

  it("points login at sign up when the only file is an orphan", async () => {
    localStorage.setItem(
      VAULT_KEY,
      JSON.stringify({
        [LOCAL_FILE_KEY]: hydrateState({
          profile: {
            onboardingComplete: true,
            firstName: "you",
            lastName: "",
            age: 19,
            heightCm: 180,
            weightKg: 75,
            targetSleep: "23:00",
            targetWake: "07:00",
          },
        }),
      }),
    );
    expect(await openFile("jbmotley06@icloud.com", PASS)).toEqual({
      ok: false,
      error: AUTH_ERRORS.orphan,
    });
  });

  it("upgrades a 0.6.19 lock so the stored hash is no longer the AES key", async () => {
    const minted = await newPasswordLock(PASS);
    const v1 = {
      algo: "pbkdf2-sha256" as const,
      iterations: minted.lock.iterations,
      salt: minted.lock.salt,
      hash: bytesToBase64(minted.master),
    };
    localStorage.setItem(
      VAULT_KEY,
      JSON.stringify({
        "email:ada@example.com": hydrateState({
          profile: {
            onboardingComplete: false,
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
          },
          researchNotes: "legacy plaintext",
        }),
      }),
    );
    localStorage.setItem(LOCKS_KEY, JSON.stringify({ "email:ada@example.com": v1 }));
    const opened = await openFile("ada@example.com", PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.researchNotes).toBe("legacy plaintext");
    const upgraded = JSON.parse(localStorage.getItem(LOCKS_KEY) ?? "{}")["email:ada@example.com"] as {
      kdf?: number;
      hash: string;
    };
    expect(upgraded.kdf).toBe(2);
    expect(upgraded.hash).not.toBe(v1.hash);
    await closeFile();
    expect(JSON.stringify(localStorage.getItem(VAULT_KEY))).not.toMatch(/legacy plaintext/);
    expect(await openFile("ada@example.com", PASS)).toMatchObject({ ok: true });
  });

  it("re-encrypts the diary when the password changes", async () => {
    const created = await createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
      ...creds,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    created.state.researchNotes = "after rotate";
    saveState(created.state);
    expect(await changePassword(PASS, NEXT_PASS, NEXT_PASS)).toEqual({ ok: true });
    await closeFile();
    expect(await openFile("ada@example.com", PASS)).toEqual({
      ok: false,
      error: AUTH_ERRORS.credentials,
    });
    const opened = await openFile("ada@example.com", NEXT_PASS);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.researchNotes).toBe("after rotate");
  });

  it("does not treat last-login as an unlocked session", () => {
    localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ login: "email:ada@example.com" }));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ login: "email:ada@example.com" }));
    localStorage.setItem(
      VAULT_KEY,
      JSON.stringify({
        "email:ada@example.com": { enc: true, v: 1, iv: "YQ==", ct: "Yg==" },
      }),
    );
    expect(getSessionLogin()).toBeNull();
    expect(loadState().profile).toBeNull();
  });
});
