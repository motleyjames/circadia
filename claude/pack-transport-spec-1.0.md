# Circadia — pack transport spec 1.0 (design, not built)

Status: **for review.** One decision marked ▶. Extends `blueprint-4.0-three-surfaces.md`
and reuses the Worker from `sync-spec-3.0.md`.

## The finding

On Sep 22 James filed a morning on his phone, enrolled with invite `183R-9A4Y` the night
before. Nothing arrived in Operator.

- Operator listens only on `127.0.0.1:43149`, deliberately.
- The phone app is a static bundle; its build strips the API routes. It has no server
  and no route to James's Mac.
- Every pack in the inbox came from the Mac, sending to Operator on the same machine.
  The last arrived Sep 13.

**The study pipeline has only ever worked when tester and Operator share a computer.**
Every shakedown tester is on a different one. Nothing is lost — each night is in the
phone's diary, and packs are rebuilt from it — but nothing is delivered.

## Goals

1. A tester's phone delivers packs to Operator from anywhere.
2. The server in between holds only ciphertext it cannot read.
3. Only the tester's device can write that tester's pack. Knowing their participant id,
   or seeing the pack's location, is not enough.
4. The same transport serves the clinic phase, with a clinic in James's place.

**Non-goals:** real-time delivery, a hosted Operator, changing what a pack contains.

---

## Design

### Invite v2 — one secret

An invite becomes **16 Crockford characters** (80 bits), shown `XXXX-XXXX-XXXX-XXXX`,
generated in Operator from `crypto.getRandomValues`. It is **a secret**: it goes to the
tester by message or email, and they are told not to share it.

Everything derives from the normalized invite, each with its own HKDF label:

```
participantId = UUID( SHA-256("circadia/invite/v2:" + invite)[0..16] )
workerId      = hex( HKDF(invite, "circadia/pack-id/v2") )        64 hex
bearer        = base64( HKDF(invite, "circadia/pack-auth/v2") )   32 bytes
```

Knowing `participantId` — which every pack carries — derives nothing else. Cloudflare sees
`workerId` and cannot link it to a participant.

**v1 stays frozen.** The 8-character codes and their derivation are unchanged and still
join. A v1 participant can file but cannot deliver, and Operator shows them as needing a
new invite. Normalization for v2 is its own frozen function, pinned by its own test —
never shared with v1 or the recovery code.

[WHY one secret rather than code plus key: one thing to type, and nothing separates the
identity from the right to write it.]

### Operator's key

On first run, Operator generates an **ECDH P-256** key pair.

- The private key stays on James's Mac, in the gitignored Operator folder, under
  FileVault. The clinic phase moves it to the Keychain.
- The public key is **built into the phone app** by `put-on-phone`. The build fails if
  the key is missing, so no phone can ship unable to send.
- Operator shows the key's short fingerprint; the phone shows the same one under You.

[WHY build it in rather than fetch it: a key fetched from the Worker could be swapped by
anyone able to write there, and every phone would then seal packs to them.]

### Sealing a pack

1. The existing builder makes the pack, and **the anonymity scan runs first.** Sealing
   never replaces de-identification.
2. A fresh ephemeral P-256 key pair per pack. ECDH with Operator's public key; HKDF-SHA256
   with label `circadia/pack/v2`; AES-GCM.
3. **Associated data: `circadia/pack/v2` plus `participantId`.** A sealed pack moved to
   another participant fails to open. This closes the gap noted as d_1_4 in
   `findings-sync-account.md`.
4. Envelope: `{ v: 2, epk, iv, ct }`. Nothing else leaves the phone — never the invite,
   the bearer, or any key but the ephemeral public one.

### The Worker

**Probably no change.** It already stores one opaque blob per 64-hex id, registers the
first bearer to write an unseen id, and requires it for every later read and write. One
object per tester, overwritten by each new pack, since packs are cumulative.

### Sending — the phone

- After filing a morning, or back-filling one, the phone seals and sends.
- Offline or failed: retried when the app next opens. **Filing never waits on sending.**
- **Delivery indicator under You:** *Last sent: today, 7:42* — or *Not sent yet; will retry
  when you're online.* It never claims a send that didn't succeed.
- After joining, the study section says so: *You're in. Night 1 of 14 starts tonight.*

### Fetching — Operator

- For each book entry with a v2 invite: derive `workerId` and `bearer`, fetch, open with
  the private key, check the associated data, then run **`validateStudyPack`** — the
  receiver's checks, unchanged.
- A pack that passes is written into the existing inbox. The console, the reject log,
  data health — everything downstream is reused as it stands.
- Failure to open, a participant mismatch, or a failed validation goes to the reject log
  with its reason.
- Fetched on open, on Refresh, and every few minutes while Operator is open. Arrival time
  is the Worker's upload time where it exposes one, otherwise the moment Operator saw the
  change.

### Leaving the study

The phone overwrites its object with a **sealed withdrawal**. The tester's last pack is
gone from Cloudflare the moment it's replaced. Operator stops counting that tester.

▶ **Whether leaving also deletes their packs from James's Mac.** Recommendation: yes —
withdrawal should mean withdrawal, and the consent copy says so plainly.

---

## Who can do what

| Holder | Find the object | Read the pack | Write the pack |
|---|---|---|---|
| Tester's phone | yes | no | yes |
| Operator | yes | **yes** | yes |
| Cloudflare | yes | no | no |
| Anyone with a participant id | no | no | no |
| Anyone with the invite | yes | no | yes — hence, a secret |

## HIPAA

The shakedown is outside HIPAA: volunteers, no covered entity. This design is chosen for
the clinic phase, where Circadia becomes a business associate whatever it can or cannot
read, and where the Security Rule expects access control, integrity and transmission
safeguards. The per-tester secret and the sealing to one key are those safeguards. Not
legal advice; the lawyer's hour before the first clinic still stands.

## Invariants

1. The Worker never receives a plaintext pack.
2. Only Operator's private key opens a sealed pack.
3. A pack sealed for one participant fails to open as another.
4. The invite derives participant id, Worker id and bearer; the participant id derives
   neither of the others.
5. v1 derivation is unchanged; v2 normalization is frozen and separately tested.
6. The anonymity scan runs before sealing; a pack that fails it is never sealed or sent.
7. Every opened pack passes `validateStudyPack`, or lands in the reject log with a reason.
8. The phone build fails without Operator's public key.
9. Nothing sent carries the invite, the bearer, or key material other than the ephemeral
   public key.
10. A send failure never blocks filing a morning.
11. The delivery indicator never shows a send that did not succeed.
12. Leaving the study overwrites the tester's object with a sealed withdrawal.
13. The book and Operator's private key are ignored by git.

## Rollout — receiver before sender

1. **Operator:** key pair, v2 invites, fetch and open. Idle until a phone sends — safe to
   ship first.
2. **Phone:** built-in key, sealing, sending, delivery indicator, withdrawal.
3. **The live test:** James takes a v2 invite, files a morning, and appears as night 1.

The Mac diary keeps sending over localhost for now. It moves to the same route in a
follow-up, so there is one path rather than two — two paths is how tonight's receivers
disagreed.

## After transport

Decide whether Operator needs its server at all. If it fetches from the Worker, it may
become a static app like the phone — likely the root of the Mac apps feeling clunky.
Then the Mac polish pass.

## Anti-goals

- No plaintext pack on any server.
- No key fetched at runtime.
- No change to what a pack contains.
- No crisis or mania signal, in any form — unchanged, and re-tested.

## Corrections (2026-09-22)

- **Version bits.** The participant id must set UUID version and variant bits
  exactly as v1 does. The formula above omitted this; the receiver rejects ids
  without them.
- **Normalized input.** Every derivation takes the normalized invite, never the
  displayed form with dashes, so Operator and the phone reach the same object
  whatever was typed.
- **Withdrawal before validation.** A withdrawal is recognised before
  validateStudyPack runs, and a tester's state follows their newest object; a
  later pack makes them active again.
- **Poll deduplication.** Operator writes a fetched pack only when its ETag
  has changed.
