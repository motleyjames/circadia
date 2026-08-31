export type CircadiaKeychainPlugin = {
  set(options: { account: string; value: string }): Promise<{ ok: boolean }>;
  get(options: { account: string }): Promise<{ value: string | null }>;
  remove(options: { account: string }): Promise<{ ok: boolean }>;
};

export declare const CircadiaKeychain: CircadiaKeychainPlugin;
