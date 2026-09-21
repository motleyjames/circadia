# Circadia — ZELVO audit triage and fixes (0.8.23, 2026-09-02)

Scanner reported 15 findings: 6 high, 9 medium. **Verified outcome: 11 were scanning build output, 3 were false positives in real source, 1 pointed at the right file for the wrong reason. Three genuine vulnerabilities the scanner did not report were found by auditing the flagged code paths, and all are fixed.**

Every claim below was proven by running the shipped server, not by reading it.

---

## What the scanner got wrong

**11 of 15 findings are generated build output**, all gitignored, none of it source:
`.next-mod/**` (6), `out/_next/**` (1), `phone/ios/App/App/public/_next/**` (1), `phone/ios/DerivedData/**` (1), plus 2 more `.next-mod` React chunks. These are Next/Turbopack bundles and an Xcode build directory. Fix is scanner config (point it at the repo, or have it honour `.gitignore`), not code.

**3 false positives in real source:**

| Finding | Why it is not real |
|---|---|
| Path traversal — `src/app/api/study/route.ts:57` | The filename comes from `inboxParticipantId(parsed)`, and every validator (`validateStudyPack`, `validateRoster`, `validateRosterV2`, `validateFault`) gates `participantId` on an **anchored** `^[0-9a-f]{8}-...$` UUID regex before it is used. Taint analysis followed `request.json()` → `writeFile` and did not model the validation gate. |
| Reflected XSS — `electron/static-server.cjs:156` | `data` is bytes read from disk, not request text. `content-type` comes from a fixed MIME allowlist keyed on file extension, defaulting to `application/octet-stream`. No request text reaches the response body. |
| `dangerouslySetInnerHTML` — `src/app/layout.tsx:58` | `PHONE_CLASS_BOOT` is a compile-time constant string in `src/lib/phone-native.ts`. No input reaches it. This is the only way to inline a boot script in Next. |

**1 finding on the right file, wrong sink:** the reported read-traversal at `static-server.cjs:155` was already defended (`insideRoot` at the three lookup sites). But the same file had a **write** traversal the scanner never flagged.

---

## What was actually wrong (found by audit, all fixed)

### 1. Unauthenticated remote crash — the worst of the three
`GET /%` threw `URIError: URI malformed` out of `decodeURIComponent` inside the request handler. Unhandled in an HTTP handler → uncaught exception → **Node ends the process and Circadia.app's server dies.** Proven: the harness printed `CONNECTION DIED` and the node process exited with a stack trace.

Reachable from any website the user visits (`fetch('http://127.0.0.1:PORT/%', {mode:'no-cors'})`) — no read access needed, the request alone kills it.

**Fixed:** decode wrapped and returns `null`; null bytes rejected; `readFileSync` guarded (EISDIR / vanished file); and a last-resort `try/catch` around the whole handler answers 500 instead of exiting.

### 2. Write path traversal in `handleStudy`
```js
const id = typeof raw.participantId === "string" ? raw.participantId.slice(0, 8) : "unknown";
const file = path.join(inbox, `${id}-${stamp}.json`);
```
`slice(0, 8)` truncates but does not sanitize. `participantId: "../../../PWNED"` → `"../../.."` → writes **outside the inbox**. Unlike the Next route, this server does no schema validation — it writes the raw request body.

Proven: three hostile ids, **zero files landed in the inbox**; they landed in `deep/a/` and `deep/a/b/` — one and two levels up, with attacker-controlled JSON content.

**Fixed:** anchored UUID check before the id touches a path (falls back to `unknown`), plus a containment assert, plus `0600` on stored packs.

### 3. No origin check — the delivery mechanism for #1 and #2
`/api/study` on the static server accepted a POST carrying `Origin: https://evil.example` and returned 200. A page can avoid CORS preflight entirely with `content-type: text/plain`; the server never checks content-type, it just `JSON.parse`s the body. So any site the user visits while Circadia is open could reach the inbox.

The Next routes for vault, fold-inbox and locked-diary already use `isLocalRequest` — **`/api/study` was the one route missing it, on both servers.**

**Fixed:** `localOrigin()` in the static server (mirrors `isLocalRequest`), and `isLocalRequest` added to the Next study route's GET and POST. Foreign origin → 403.

### 4. Symlink escape past the lexical check (defence in depth)
`path.relative` containment is lexical; a symlink under the UI root resolves anywhere on disk and `readFileSync` follows it. **Fixed:** `servableFile()` re-checks containment after `fs.realpathSync` and requires a regular file.

### 5. Missing response headers (defence in depth)
**Fixed:** every response now carries `x-content-type-options: nosniff`, `x-frame-options: DENY`, `content-security-policy: frame-ancestors 'none'`, `referrer-policy: no-referrer`, alongside the existing `no-store`. The local diary can no longer be framed or sniffed by another page.

---

## Verification

Exploit harness re-run against the patched server — all seven closed, app unaffected:

```
PASS  write traversal          all 4 contained in inbox
PASS  cross-origin POST        status 403
PASS  malformed URL crash      statuses 404,404,404,200,200
PASS  read traversal           served <h1>Circadia</h1>
PASS  symlink escape           status 200 (fallback, secret not served)
PASS  security headers         nosniff | DENY | frame-ancestors 'none' | no-referrer
PASS  app still works          / 200, /you 200, pack stored
```

Six regression tests added to `src/lib/static-server.test.ts` (one per hole), plus a `phone-shell.test.ts` assertion that all four local write routes contain `isLocalRequest` and that the old `slice(0, 8)` line cannot come back. Suite in a clean clone: **452 passing, 3 failures** — all three pre-existing and environment-only (generated `capacitor.config.json` and gitignored `data/study-inbox` absent in a fresh clone). `tsc --noEmit` and eslint clean.

## Files changed
`electron/static-server.cjs` · `src/app/api/study/route.ts` · `src/lib/static-server.test.ts` · `src/lib/phone-shell.test.ts` · `AGENTS.md` (new invariant) · `README.md` (new "Security posture" section) · version 0.8.22 → 0.8.23.

## Still open
- Deep schema validation differs between the two servers: the Next route runs the full validators, `static-server.cjs` only checks the schema string and identity-field absence. Worth unifying if that server stays in the shipped app.
- Pre-existing `phone/capacitor.config.ts(28,7)` `KeyboardResize` type error fails `tsc`/`next build` on a clean clone (passes on the Mac). Unrelated to security, but it blocks CI.
