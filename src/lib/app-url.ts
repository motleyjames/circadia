/** Absolute URL for a root path on this origin (Capacitor custom scheme included). */
export function resolveAppUrl(path: string): string {
  if (typeof document === "undefined" || !document.baseURI) return path;
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return path;
  }
}

/** Candidate hrefs for a packed asset. Capacitor origins and base tags differ. */
export function resolveAppHrefs(path: string): string[] {
  const hrefs: string[] = [];
  const add = (href: string) => {
    if (href && !hrefs.includes(href)) hrefs.push(href);
  };
  add(path);
  add(resolveAppUrl(path));
  if (typeof window !== "undefined") {
    try {
      const origin = window.location.origin;
      if (origin && origin !== "null") {
        add(`${origin}${path.startsWith("/") ? path : `/${path}`}`);
      }
    } catch {
      /* origin unavailable */
    }
    try {
      add(new URL(path, `${window.location.origin}/`).href);
    } catch {
      /* malformed origin */
    }
  }
  return hrefs;
}
