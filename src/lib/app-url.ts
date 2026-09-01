/** Absolute URL for a root path on this origin (Capacitor custom scheme included). */
export function resolveAppUrl(path: string): string {
  if (typeof document === "undefined" || !document.baseURI) return path;
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return path;
  }
}
