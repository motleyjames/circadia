# Wrapping the key instead of deriving it — 0.12.0

Staged on the Mac, uncommitted. Prerequisite for any hosted sync. **549 tests**
(546 + 3 in the second pass), `tsc --noEmit` clean on the Mac itself, eslint at 1
pre-existing warning. Three cloud-clone-only failures as always.

## Why

James asked to host the data "all in one spot," wanting it to feel like a real app —
log in anywhere, diary is there — and eventually to ship to strangers.

Reading `password.ts` turned up something that made that easy and something that
made it dangerous. The easy part: `master = PBKDF2(password, salt)` — the key *is*
the password stretched, and the lock stored only `SHA-256(master)` as a verifier. So
encrypted sync with password-based recovery on a new device already worked in
principle; a server would only ever need to hold ciphertext.

The dangerous part is the same fact. Because the key was derived:
1. **A password change re-keyed the vault**, forcing a full re-encrypt.
2. **A recovery code was impossible** — a second password derives a different key.
3. **The first password opens the vault forever**, even after a change.
4. **100k PBKDF2-SHA256 with an 8-character minimum** was sized for an attacker who
   must first steal the Mac. Hosting turns one breach into every user's ciphertext
   available for parallel offline grinding.

## What changed

**The data key is now random and wrapped**, not derived. `PasswordLock` gains
`wrap: { salt, iterations, iv, ct }` — the key under AES-GCM, with a KEK from
PBKDF2. The GCM tag is the verifier now, so nothing on disk confirms a password
without also opening the vault.

**HKDF splits the KEK** into a wrap key (`circadia/wrap/v1`) and an auth key
(`circadia/auth/v1`). `authKeyFor()` is exported and unused — it ships early on
purpose, because adding it later would mean migrating every vault twice.

**PBKDF2 at 600k** (OWASP), measured at 95 ms in the cloud container, so roughly
200–400 ms on the iPhone. Argon2id was rejected deliberately: it needs a WASM build
behaving identically in Node, Electron and a WKWebView under a custom scheme, and
PBKDF2 is native in all three.

**`PASSWORD_MIN` 8 → 10.** Verified safe first: `passwordIssue` is only called when
minting a lock, never on login, so existing shorter passwords keep working.

**`changePassword` re-wraps instead of re-keying** — about thirty bytes instead of
the whole diary, and it cannot half-fail partway through a rewrite. It drops the
legacy verifier, which is what actually retires the old password.

## The migration, and the trap it avoids

Migration **adopts the existing derived key as the data key and wraps it**. Not one
envelope is re-encrypted; the cost is one extra derivation on one login.

The trap: the Mac and the phone fold into each other, and one updates before the
other. A migrated lock therefore **keeps every legacy field and stays at `kdf: 2`**.
Old code reads the legacy fields and unlocks exactly as before; new code sees `wrap`
and prefers it. Bumping the marker to 3 would have sent old code down its 0.6.19
branch, where the correct password reads as *wrong* — a silent lockout on whichever
device updated second.

Locks minted fresh at v3 carry no legacy verifier, so a pre-0.12.0 client cannot open
an account created after the update. That is the one compatibility direction left
open, and it is documented in the code.

**Safety:** `unlockMaster` proves the new wrap re-opens, in memory, before returning
a `migratedLock`. On any doubt the unlock still succeeds and migration simply waits.
There is no password reset here — a bad migration would take the diary with it.

## Tests (21 new in `password.test.ts`)

Legacy locks are built by reproducing the real pre-0.12.0 derivation, not
approximated — the previous version of two tests borrowed a salt and key from
`newPasswordLock`, which no longer relate, and that is exactly how the login-test
failure surfaced. Covered: no password or key on disk; two locks from one password
yield different keys; tampered wrap rejected; a v3 lock with no wrap is unopenable
rather than weakly openable; migration preserves the key so old envelopes still
decrypt; every legacy field retained; **an old client still opens a migrated lock**;
wrap preferred once present (proved by poisoning the legacy verifier); migration runs
once; 0.6.19 locks still work; rewrap keeps the key, retires the old password, and
removes the legacy route; auth key is stable, differs per password, cannot unwrap.

## Release plan

This is **release one of two**. While both formats coexist the weak 100k derivation
is still on disk, so the security win is only realised in **release two**, which
drops the legacy fields once both surfaces are confirmed updated.

## Next
1. Recovery code — now possible, and needed before strangers: forget the password and
   nothing recovers it. A UI flow and a support story, not just crypto.
2. Release two: drop legacy verifier fields.
3. Then encrypted blob sync — at that point a small amount of code.
4. Consented study packs to a separate plaintext table (already de-identified).
