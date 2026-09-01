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
- Library notes in `src/lib/research.ts` carry `reviewedThrough`. `staleResearchIds(RESEARCH)` must stay empty. Do not add a PubMed fetch. Mouth (`say`) still cannot contain AASM / CBT-I / SCN.
- Surface isolation is `src/proxy.ts` (Next 16 renamed middleware). Diary 404s `/mod`. Operator 404s vault, study, and session-key.
- Static pack: `npm run pack:static` parks `src/app/api` and `src/app/mod`, then writes `out/`. Never set `CIRCADIA_PACK_STATIC` in `.env.local`. Operator Next builds stay `standalone`.
- Circadia.app pulls GitHub `main`. The CI workflow lives at `scripts/github-ci.yml` because GitHub App tokens without `workflow` scope cannot create `.github/workflows/*.yml`. Copy it there once that scope exists.
- Phone is the diary only. Never Capacitor-wrap Operator. Bundle id `app.circadia.diary`. Static pack parks `/mod` and `/api`; phone vault is Filesystem `vault.json` plus the Keychain plugin (fail closed if Keychain writes fail).
- iOS project lives in `phone/`. `npm run put-on-phone` packs the Mac diary, then signs with (1) a leftover development profile for this iPhone, or (2) an Xcode Accounts team id including Xcode 16 keys, or (3) a signed-in Xcode session with no stored team id. A keychain certificate is not an Xcode account and must not be passed into `-allowProvisioningUpdates` on its own. Then `xcodebuild` + `native-run` onto a reachable physical iPhone. This Linux VM cannot archive or codesign. Do not run `dock` / `put-on-dock` / `put-on-phone` here.

