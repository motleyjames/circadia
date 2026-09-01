/**
 * Same-origin diary paths WKWebView must not treat as a new document.
 * A full load kills in-memory masters and is what made every tab a login.
 */
export function diaryPathToPush(href: string, currentOrigin: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (/^(mailto:|tel:|javascript:)/i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed, currentOrigin);
  } catch {
    return null;
  }
  if (url.origin !== currentOrigin) return null;
  if (url.pathname.startsWith("/api/")) return null;
  if (url.pathname === "/mod" || url.pathname.startsWith("/mod/")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function diaryClickTarget(event: MouseEvent): string | null {
  if (event.defaultPrevented) return null;
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const node = event.target;
  if (!(node instanceof Element)) return null;
  const anchor = node.closest("a");
  if (!anchor) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  const href = anchor.getAttribute("href");
  if (!href) return null;
  return diaryPathToPush(href, window.location.origin);
}
