# Recovery codes — release one of two

A second wrap of the vault data key, under a Crockford base32 recovery code.
`kdf` is not bumped. A client that has never heard of `recovery` still opens
`wrap` with the password.

This is release one of two. It is unreliable until both Mac and phone are
updated — exactly as key-wrapping 0.12.0 was. The password wrap shipped while
old code still read the legacy verifier; recovery ships while old code still
rebuilds a lock from known fields only.

## What an old client does

JSON round-trip of a parsed lock keeps unknown fields. `writeLocks`,
`writeDiskVault`, `writePhoneVault`, `parseDiskVault`, `installLockedVault`,
and a locked-diary pack all stringify the object they were given.

What drops `recovery` is a reconstruct. `rewrapLock(password, dataKey)` — no
`previous` — still builds `{ algo, iterations, salt, kdf, wrap }`. That is the
phone that has not updated. A password change there silently kills the recovery
wrap. Do not change the two-argument form to paper over that. Release two is
both surfaces passing `previous`.

`unlockMaster`'s migration write spreads the parsed lock (`{ ...lock, hash, kdf: 2, wrap }`),
so an old client that migrates keeps extras. Ordinary login with `wrap` already
present does not rewrite the lock.

## Boot merge

`mergeDiskVault` used to be presence-only on locks: if local already had a lock
for that login, disk was ignored, then the merged vault was written back. A
stale local copy without `recovery` deleted the disk copy that had it. That is
the 0.12.0 Mac/phone window, on the write side.

Locks now merge field-wise when the data key is the same (identical `wrap`, or
matching legacy salt/hash on a migration pair). The copy that carries
`recovery` wins that field. Different wraps are a password change or a re-key
and do not receive the other copy's recovery — that would attach a second door
to a different room, or un-retire an old password.

## Until the phone is updated

A recovery code saved on the Mac can be packed onto the phone and will open
there if the wrap is still the one the code was minted against. Changing the
password on the old phone drops the recovery wrap. Generating a recovery code
on You, then using the phone that has not updated, is the staggered-update
hazard. Tell people that, or wait for release two.

Offer is on You after a named login, not at signup, not as an interstitial on
next unlock. That choice is still open.
