/**
 * Next `output` mode. Dock uses `next start` (standalone). Static export is only
 * for `npm run dist` via CIRCADIA_PACK_STATIC — never because CIRCADIA_ELECTRON
 * leaked from the shell or a .env file. That leak prerendered /check-in without
 * CircadiaProvider and killed the Operator Dock compile.
 */
export function nextOutput(env: {
  CIRCADIA_PACK_STATIC?: string;
  CIRCADIA_ELECTRON?: string;
  CIRCADIA_SURFACE?: string;
  NEXT_PUBLIC_CIRCADIA_SURFACE?: string;
}): "export" | "standalone" {
  const operator =
    env.CIRCADIA_SURFACE === "mod" || env.NEXT_PUBLIC_CIRCADIA_SURFACE === "mod";
  if (operator) return "standalone";
  if (env.CIRCADIA_PACK_STATIC === "1") return "export";
  return "standalone";
}

export function nextImagesUnoptimized(env: {
  CIRCADIA_PACK_STATIC?: string;
  CIRCADIA_SURFACE?: string;
  NEXT_PUBLIC_CIRCADIA_SURFACE?: string;
}): boolean {
  return nextOutput(env) === "export";
}
