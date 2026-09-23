# Findings - 20260922_214328

**Task:** Somnadia is local-first. This change rebuilds the morning diary, removes a 75-minute ceiling on reported durations, and stops sending nine fields. Receivers still accept every old pack.

**Confidence:** 60%  
**Evidence:** 1 probe(s) established something conclusive against the source.

0 need a person - 1 settled by evidence - 3 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> The new upper bound replacing the 75-minute cap (e.g., 480 minutes) may itself be wrong if Somnadia tracks full-night sleep durations, which can exceed 8 hours; the correct bound depends on what the duration field actually represents, and no council member verified this.

No resolution strategy could handle this dissent

### d_1_2  (judgement - loop 1)
> Retaining the nine deprecated columns in local storage indefinitely (as suggested) will accumulate dead schema weight; if the local DB is SQLite, `ALTER TABLE DROP COLUMN` is only supported in SQLite ≥ 3.35.0, so cleanup may be blocked on minimum SDK version constraints.

The concern is a design-taste and environment-constraint judgment (minimum SDK vs SQLite 3.35.0) rather than a verifiable behaviour in any identified source file; no migration or schema file appears i

### d_1_3  (none - loop 1)
> The offline sync queue may serialize payloads at enqueue time rather than at send time; if so, upgrading the serializer will not affect already-queued items, and a queue migration or dual-format send path is required to avoid sending stale schemas.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_1  (code_reading - loop 1)
> If Somnadia supports peer-to-peer sync between devices (common in local-first architectures), a new-sender → old-receiver path exists where the old receiver may reject or silently mishandle payloads missing the nine fields, and none of the council members confirmed whether old receivers are actually tolerant readers or only new receivers are.

Reading the source settles this. Read src/app/api/fold-inbox/route.ts. The POST handler gracefully handles missing or invalid fields by treating any payload where `source` is not exactly `"inbox"` (including missing, null, or malformed bodies) as a non-consuming no-op response rather than an error. Cited src/app/api/fold-inbox/route.ts:75: `if (source !== "inbox") {`

`probe: read_code__incoming_payload_validation_9614`

**Decisions (James, Sep 22)**
- d_1_0 declined: the ceiling applies to sleep latency and time awake in the night, not total sleep. Values above three hours are stored as 180 with a floor flag, and efficiency is marked as an upper bound.
- d_1_2 declined: there is no SQLite. The diary is an encrypted JSON vault, and old nights keep their fields by design.
- d_1_3 declined: packs are not queued. The phone rebuilds each pack from the diary at send time, so the first send after an update uses the new format.
