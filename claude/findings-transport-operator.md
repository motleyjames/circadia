# Findings - 20260922_122756

**Task:** Circadia is local-first. Review the receiving half of pack transport: Operator generates an ECDH P-256 key pair kept in a gitignored folder; v2 invites are 16 Crockford characters from which participant id, Worker id and bearer derive via separate labels, always from the normalized form; sealed packs are opened server-side with AES-GCM bound to the participant id, validated, and written to the inb

**Confidence:** 36%  
**Evidence:** 1 probe(s) established something conclusive against the source.

1 need a person - 0 settled by evidence - 4 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_1_1  (code_reading - loop 1)
> ETag-only gating on inbox writes does not prevent replay of a previously valid sealed pack whose ETag was seen, reset, and redelivered (e.g., after a storage restore or proxy cache flush)

Reading the source CONFIRMS this concern. Read src/app/api/fold-inbox/route.ts. The POST handler only checks that the request body contains `source: "inbox"` (plus authentication), with no ETag, nonce, timestamp, sequence number, or content hash verification to prevent replay of a previously valid sealed pack. Cited src/app/api/fold-inbox/route.ts:75: `if (source !== "inbox") {`

`probe: read_code__replay_prevention_mechanism_4284`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> 80 bits of invite entropy (16 Crockford chars) is insufficient for deriving a long-lived bearer token if server-side rate-limiting is not strictly enforced, because offline brute-force of the invite seed is feasible below 128 bits

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> Storing the ECDH P-256 private key as an unencrypted file with only .gitignore protection will leak the key on any workspace copy, backup, or container image layer that does not replicate the .gitignore rule

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> The spec does not define whether AES-GCM nonces are random or counter-derived; if counter-derived from participant state, a state reset causes nonce reuse, which is catastrophic for GCM

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> Withdrawn participants' Workers will continue submitting packs that the server must explicitly reject; if the withdrawal check is not placed before the inbox write in the validation pipeline, withdrawn-participant data will accumulate silently

No resolution strategy could handle this dissent
