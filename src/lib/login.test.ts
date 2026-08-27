import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTH_ERRORS, LOCAL_FILE_KEY, loginKeyFromInput, loginKeyFromProfile } from "./login";
import {
  SESSION_KEY,
  STORAGE_KEY,
  VAULT_KEY,
  attachLoginToCurrent,
  closeFile,
  createFile,
  eraseCurrentFile,
  getSessionLogin,
  hydrateState,
  loadState,
  migrateToVault,
  openFile,
  saveState,
} from "./storage";

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
    expect(loginKeyFromInput("not-an-id")).toBeNull();
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
    const mem = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: mem, configurable: true });
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("migrates a named file with email into a session", () => {
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
    expect(getSessionLogin()).toBe("email:james@colorado.edu");
    expect(loadState().profile?.name).toBe("James Motley");
  });

  it("does not auto-open an empty legacy blob", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile: null, reports: [] }));
    migrateToVault();
    expect(getSessionLogin()).toBeNull();
    expect(JSON.parse(localStorage.getItem(VAULT_KEY) ?? "{}")).toEqual({});
  });

  it("creates a file, logs out without deleting it, then opens it again", () => {
    const created = createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.state.profile?.onboardingComplete).toBe(false);
    expect(created.state.profile?.firstName).toBe("Ada");
    expect(getSessionLogin()).toBe("email:ada@example.com");

    created.state.researchNotes = "keep me";
    saveState(created.state);
    closeFile();
    expect(getSessionLogin()).toBeNull();
    expect(loadState().profile).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();

    const opened = openFile("ADA@example.com");
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.researchNotes).toBe("keep me");
    expect(opened.state.profile?.lastName).toBe("Lovelace");
  });

  it("refuses a second file for the same login and a missing login", () => {
    expect(createFile({ firstName: "A", lastName: "", contact: "a@example.com" })).toEqual({
      ok: false,
      error: AUTH_ERRORS.name,
    });
    const first = createFile({ firstName: "Ada", lastName: "Lovelace", contact: "303-555-0199" });
    expect(first.ok).toBe(true);
    expect(createFile({ firstName: "Ada", lastName: "Lovelace", contact: "3035550199" })).toEqual({
      ok: false,
      error: AUTH_ERRORS.exists,
    });
    closeFile();
    expect(openFile("nobody@example.com")).toEqual({ ok: false, error: AUTH_ERRORS.missing });
  });

  it("erase removes the current file; attachLogin rekeys a local file", () => {
    const created = createFile({
      firstName: "Ada",
      lastName: "Lovelace",
      contact: "ada@example.com",
    });
    expect(created.ok).toBe(true);
    eraseCurrentFile();
    expect(getSessionLogin()).toBeNull();
    expect(openFile("ada@example.com")).toEqual({ ok: false, error: AUTH_ERRORS.missing });

    localStorage.setItem(
      VAULT_KEY,
      JSON.stringify({
        [LOCAL_FILE_KEY]: hydrateState({
          profile: {
            onboardingComplete: true,
            firstName: "Ada",
            lastName: "Lovelace",
            age: 19,
            heightCm: 180,
            weightKg: 75,
            targetSleep: "23:00",
            targetWake: "07:00",
          },
        }),
      }),
    );
    localStorage.setItem(SESSION_KEY, JSON.stringify({ login: LOCAL_FILE_KEY }));
    const attached = attachLoginToCurrent("ada@example.com");
    expect(attached.ok).toBe(true);
    if (!attached.ok) return;
    expect(attached.login).toBe("email:ada@example.com");
    expect(getSessionLogin()).toBe("email:ada@example.com");
    expect(JSON.parse(localStorage.getItem(VAULT_KEY) ?? "{}")[LOCAL_FILE_KEY]).toBeUndefined();
  });
});
