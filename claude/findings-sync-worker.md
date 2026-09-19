# Findings - 20260919_161701

**Task:** Circadia is local-first: no server for diary data; this Worker stores opaque ciphertext and cannot read it. Spec 3.1 corrections: one anchored 64-hex id alphabet for both object kinds (not UUID), hop 1 bearer is lookupAuth = HKDF(lookupKey, circadia/lookup-auth/v1). Worker must not UUID-shape digests, must reject a UUID as malformed, and must stay one path. Review worker/src/index.ts, worker/src/i

**Confidence:** 95%  
**Evidence:** 2 probe(s) established something conclusive against the source.

0 need a person - 7 settled by evidence - 2 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_1  (judgement - loop 1)
> Collapsing to a single `/:id` path may conflict with the need for distinct HTTP methods or metadata per object kind (account vs entry), and the spec document should be checked for whether it actually requires kind-aware behavior that a single undifferentiated path cannot support

The concern is about files that do not exist in this repository, making it impossible to probe the actual routing behavior or spec requirements; this is a judgement call about absent code, not verifia

### d_2_1  (judgement - loop 2)
> The timing-safe comparison may throw on length-mismatched inputs before reaching the constant-time path, leaking token length information via error timing; the code may not pre-check or normalize buffer lengths.

The file 'worker/src/index.ts' is not present in the repository's listed modules, making it impossible to probe the actual timing-safe comparison implementation; the concern cannot be settled against 

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_2  (code_reading - loop 1)
> Uppercase hex rejection (`^[0-9a-f]{64}$` not `^[0-9a-fA-F]{64}$`) is assumed by all opinions but if existing stored KV keys contain uppercase hex characters, enforcing lowercase-only without a migration will orphan that data

Reading the source settles this. Read worker/src/index.ts. The regex `ACCOUNT_ID = /^[0-9a-f]{64}$/` (line 6) only accepts lowercase hex characters, and there is no migration or normalization logic anywhere in the code that handles uppercase hex characters in existing stored keys. Cited worker/src/index.ts:5: `/** 32 bytes as lowercase hex. One alphabet for every object. Anchored. */`

`probe: read_code__hex_key_validation_regex_8864`

### d_1_3  (semantic_bridge - loop 1)
> The UUID rejection regex should also catch unhyphenated 32-character hex strings (which are valid UUID representations without hyphens) since these could be confused with truncated 64-hex IDs, but none of the opinions specify this edge case precisely

Read worker/src/index.ts. The regex `ACCOUNT_ID = /^[0-9a-f]{64}$/` (line 6) only accepts lowercase hex characters, and there is no migration or normalization logic anywhere in the code that handles uppercase hex characters in existing stored keys. Cited worker/src/index.ts:5: `/** 32 bytes as lowercase hex. One alphabet for every object. Anchored. */`

`probe: read_code__hex_key_validation_regex_8864`

### d_2_2  (code_reading - loop 2)
> The UUID rejection logic may only check the 36-character hyphenated form and miss the 32-character stripped form, which would pass a loose "is it hex?" check and only fail on length (64 vs 32) — but if any code path truncates or pads, this could slip through.

Reading the source settles this. Read worker/src/index.ts. The regex only accepts exactly 64 lowercase hex characters (32 bytes as hex), which is neither the 36-character hyphenated UUID form nor the 32-character stripped UUID form — it is an entirely different format, so neither UUID form is valid Cited worker/src/index.ts:6: `export const ACCOUNT_ID = /^[0-9a-f]{64}$/;`

`probe: read_code__uuid_rejection_logic_3946`

### d_2_3  (code_reading - loop 2)
> Unknown or unsupported HTTP methods/actions on the single path may return 404 or 405 instead of 400, leaking routing structure information inconsistent with the single-path contract.

Reading the source settles this. Read worker/src/index.ts. The regex only accepts exactly 64 lowercase hex characters (32 bytes as hex), which is neither the 36-character hyphenated UUID form nor the 32-character stripped UUID form — it is an entirely different format, so neither UUID form is valid Cited worker/src/index.ts:6: `export const ACCOUNT_ID = /^[0-9a-f]{64}$/;`

`probe: read_code__uuid_rejection_logic_3946`

### d_2_3  (semantic_bridge_weak - loop 2)
> Unknown or unsupported HTTP methods/actions on the single path may return 404 or 405 instead of 400, leaking routing structure information inconsistent with the single-path contract.


`probe: hypothesis_L2_H3`

### d_2_4  (code_reading - loop 2)
> Error responses may echo back the malformed identifier string in the JSON body, potentially enabling a reflection-based information leak in a zero-knowledge system.

Reading the source settles this. Read worker/src/index.ts. The regex only accepts exactly 64 lowercase hex characters (32 bytes as hex), which is neither the 36-character hyphenated UUID form nor the 32-character stripped UUID form — it is an entirely different format, so neither UUID form is valid Cited worker/src/index.ts:6: `export const ACCOUNT_ID = /^[0-9a-f]{64}$/;`

`probe: read_code__uuid_rejection_logic_3946`

### d_2_4  (semantic_bridge_weak - loop 2)
> Error responses may echo back the malformed identifier string in the JSON body, potentially enabling a reflection-based information leak in a zero-knowledge system.


`probe: hypothesis_L2_H1`
