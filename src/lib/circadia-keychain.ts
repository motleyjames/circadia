import { registerPlugin } from "@capacitor/core";

export type CircadiaKeychainPlugin = {
  set(options: { account: string; value: string }): Promise<{ ok: boolean }>;
  get(options: { account: string }): Promise<{ value: string | null }>;
  remove(options: { account: string }): Promise<{ ok: boolean }>;
};

const web: CircadiaKeychainPlugin = {
  async set() {
    return { ok: false };
  },
  async get() {
    return { value: null };
  },
  async remove() {
    return { ok: false };
  },
};

export const CircadiaKeychain = registerPlugin<CircadiaKeychainPlugin>("CircadiaKeychain", {
  web: () => Promise.resolve(web),
});
