/**
 * Next `output` mode. Dock uses `next start` (standalone). Static export is only
 * for `npm run dist` via CIRCADIA_PACK_STATIC — never because CIRCADIA_ELECTRON
 * leaked from the shell or a .env file. That leak prerendered /check-in without
 * CircadiaProvider and killed the Operator Dock compile.
 *
 * Do not give the phone pack a custom distDir. Next 16 `output: "export"` with
 * distDir !== ".next" treats that folder as `out/` and still builds into `.next`,
 * which is how Circadia.app lost its CSS open. Pack stashes a diary-server `.next`
 * around the export instead (see electron/build-ui.cjs).
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

export function nextDistDir(env: {
  CIRCADIA_PACK_STATIC?: string;
  CIRCADIA_SURFACE?: string;
  NEXT_PUBLIC_CIRCADIA_SURFACE?: string;
}): ".next-mod" | ".next" {
  const operator =
    env.CIRCADIA_SURFACE === "mod" || env.NEXT_PUBLIC_CIRCADIA_SURFACE === "mod";
  if (operator) return ".next-mod";
  return ".next";
}

export function nextImagesUnoptimized(env: {
  CIRCADIA_PACK_STATIC?: string;
  CIRCADIA_SURFACE?: string;
  NEXT_PUBLIC_CIRCADIA_SURFACE?: string;
}): boolean {
  return nextOutput(env) === "export";
}
