<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Circadia — agent notes

Local-first Next.js sleep companion. No database and no cloud auth. Profile, mornings, and chat live in the browser vault.

## Commands

- Install: `npm ci`
- Diary: `npm run dev` → http://127.0.0.1:43147
- Operator inbox: `npm run mod` → http://127.0.0.1:43149 (passphrase `circadia-local` unless `CIRCADIA_MOD_KEY` is set)
- Checks: `npm test` and `npm run typecheck`

## Invariants

- Operator Next builds must stay `standalone`. Never let `CIRCADIA_ELECTRON=1` flip the diary into static export during an Operator compile.
- `useCircadia` must not throw when the provider is missing. Diary routes are server-gated; they are not `"use client"` pages.
- Linux cannot compile AppKit. `npm run dock` / `put-on-dock` failing here is expected. Those scripts are Mac-only.
- Mac Dock install belongs in a clone of https://github.com/motleyjames/circadia.git at 0.6.5 or newer. Never run dock commands in an old `rest-ai` 0.5.0 tree.
- This Linux VM cannot write the Mac Dock. After a change, `git push` to GitHub. Opening Circadia.app pulls `main` via `electron/dock-update.cjs`. Do not tell James to `put-on-dock` unless `launcher.swift` or the `.app` bundle layout changed.
- Operator never displays names, email, phone, or body measurements. Signups stitch on `participantId`. Sleep stats only. `summarizeInbox` must drop PII even if a legacy roster file still has a name.

