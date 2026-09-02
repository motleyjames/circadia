export {};

declare global {
  interface Window {
    circadiaDesktop?: {
      native: boolean;
      token?: string;
      sessionKey?: {
        set: (login: string, master: string) => Promise<boolean>;
        get: (login: string) => Promise<string | null>;
        delete: (login: string) => Promise<void>;
      };
    };
    Capacitor?: { isNativePlatform?: () => boolean };
    __CIRCADIA_PACK_STATUS__?: "packed" | "empty";
    __CIRCADIA_LOCKED_DIARY__?: unknown;
  }
}
