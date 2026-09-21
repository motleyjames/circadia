# Findings - 20260921_163843

**Task:** Circadia is local-first: study packs are de-identified and leave the device only with consent. Crisis and mania disclosures never leave the device in any form; a crisis match suppresses every safety flag from the same disclosure, even one that also matches drowsy-driving. Review the console data layer: short Crockford invite codes with SHA-256 derived participantIds, episodeNight on each pack nigh

**Confidence:** 95%  
**Evidence:** 1 probe(s) established something conclusive against the source.

0 need a person - 5 settled by evidence - 12 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> `SHA-256(inviteCode)` without a salt or HMAC key is brute-forceable offline for short Crockford codes (likely ≤10 characters, ~50 bits of entropy), allowing an attacker with a participantId to recover the invite code and correlate across packs

No resolution strategy could handle this dissent

### d_1_1  (none - loop 1)
> The gitignored reject log may write raw pack payloads containing crisis/mania disclosure text to disk, violating the "never leave the device in any form" invariant if "any form" includes unredacted local persistence outside the app's encrypted store

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> A suppressed drowsy-driving flag from a crisis-matched disclosure could be reconstructed after bi-directional diary-fold propagation if the fold carries the flag to the paired diary entry and the paired entry is not itself crisis-tagged

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> Old packs generated before the current participantId validator was tightened may now be silently rejected by the unchanged (strict) validator, causing data loss for legacy participants

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> The `suppressedBy` annotation, if it references a crisis/mania classification, is itself sensitive metadata that must be stripped before export — without an explicit stripping step it could leak disclosure type information

No resolution strategy could handle this dissent

### d_2_0  (none - loop 2)
> If the crisis-suppression logic runs after pack serialization or at the transport/UI layer rather than at disclosure scope before serialization, a co-occurring drowsy-driving flag could leak in the serialized payload even when the crisis rule should have suppressed it.

No resolution strategy could handle this dissent

### d_2_1  (none - loop 2)
> Short Crockford invite codes (e.g., 6–8 characters, ~30–40 bits of input entropy) fed into SHA-256 may allow brute-force enumeration of the invite-code space to reverse participantIds, breaking de-identification for anyone with access to study packs.

No resolution strategy could handle this dissent

### d_2_2  (none - loop 2)
> The gitignored reject log may persist unsanitized disclosure fragments or derived identifiers on disk if redaction-at-write is not explicitly enforced in the logging code path, creating an uncontrolled local PHI store.

No resolution strategy could handle this dissent

### d_3_0  (none - loop 3)
> Raw SHA-256 over short Crockford invite codes (e.g., 6 characters ≈ ~33 million possibilities) is brute-forceable in seconds; the participantId derivation may need key stretching or a secret salt to resist offline enumeration.

No resolution strategy could handle this dissent

### d_3_1  (none - loop 3)
> Bidirectional safety-flag propagation through the diary fold can cause a single drowsy-driving event to appear on multiple episodeNights, and no deduplication rule is specified—downstream analyses will double-count safety events.

No resolution strategy could handle this dissent

### d_3_3  (none - loop 3)
> Crisis suppression is specified as atomic but no test or assertion enforces that it fires before pack serialization—a race or ordering bug could allow a co-matched drowsy-driving flag to escape in a partially constructed pack.

No resolution strategy could handle this dissent

### d_3_4  (none - loop 3)
> Crockford base-32 canonicalization (I/L→1, O→0, U removal, case folding) is not verified before SHA-256 hashing; formatting variations in invite codes could produce distinct participantIds for the same participant.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_2_3  (no_resolver - loop 2)
> Bidirectional diary fold propagation of safety flags through old packs that lack episodeNight or participantId fields may silently corrupt or spuriously synthesize flags if the fold implementation does not explicitly discriminate schema versions.

No resolution strategy could handle this dissent

### d_2_3  (semantic_bridge_weak - loop 2)
> Bidirectional diary fold propagation of safety flags through old packs that lack episodeNight or participantId fields may silently corrupt or spuriously synthesize flags if the fold implementation does not explicitly discriminate schema versions.


`probe: hypothesis_L2_H3`

### d_2_4  (no_resolver - loop 2)
> No compensating control exists for a suppressed drowsy-driving flag co-occurring with a crisis disclosure; if the user never has a subsequent non-crisis session (e.g., drops out of the study), the drowsy-driving safety signal is permanently lost.

No resolution strategy could handle this dissent

### d_2_4  (semantic_bridge_weak - loop 2)
> No compensating control exists for a suppressed drowsy-driving flag co-occurring with a crisis disclosure; if the user never has a subsequent non-crisis session (e.g., drops out of the study), the drowsy-driving safety signal is permanently lost.


`probe: hypothesis_L2_H1`

### d_3_2  (code_reading - loop 3)
> The gitignored reject log may contain partial disclosure text or malformed sensitive payloads; without encryption at rest and field-level redaction, it is a local exfiltration vector.

Reading the source settles this. Read src/app/api/fold-inbox/route.ts. This code only reads existing files and deletes one (unlink); it never writes any log, reject log, or rejection/disclosure data to disk, so there is no writing to persist or encrypt/redact. Cited src/app/api/fold-inbox/route.ts:79: `await unlink(foldInboxFilePath());`

`probe: read_code__reject_log_write_2212`
