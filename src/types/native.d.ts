export {};

declare global {
  interface Window {
    circadiaDesktop?: { native: boolean; token?: string };
  }
}
