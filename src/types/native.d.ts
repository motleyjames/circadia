export {};

declare global {
  interface Window {
    circadiaDesktop?: { native: boolean; token?: string };
    Capacitor?: { isNativePlatform?: () => boolean };
    __CIRCADIA_PACK_STATUS__?: "packed" | "empty";
    __CIRCADIA_LOCKED_DIARY__?: unknown;
  }
}
