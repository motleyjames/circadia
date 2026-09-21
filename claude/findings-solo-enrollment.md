# Findings - 20260921_155310

**Task:** Circadia is local-first: study packs are de-identified and leave the device only with consent. Solo shakedown episodes have no clinician and never reach treatment; createTreatmentWindow still rejects a null clinicianId. nightsElapsed is an optional non-negative count; enrolledAt, name and cohort never enter a pack. An invite code minted in Operator becomes the participantId, so re-entering it afte

**Confidence:** 88%  
**Evidence:** 1 probe(s) established something conclusive against the source.

0 need a person - 4 settled by evidence - 5 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> If `joinStudy` is made fully idempotent (upsert), two different physical users who somehow obtain the same invite code could silently merge into one participant record; the system needs a uniqueness or single-use constraint on invite codes at the Operator level to prevent this.

No resolution strategy could handle this dissent

### d_1_1  (judgement - loop 1)
> Relying solely on a discriminated union to prevent shakedown episodes from reaching `createTreatmentWindow` may be insufficient if any code path constructs a `TreatmentEpisode` with a fabricated clinicianId; a runtime check inside `createTreatmentWindow` that validates the clinicianId against a real clinician registry is still necessary as defense-in-depth.

The concern references 'createTreatmentWindow', 'TreatmentEpisode', and a 'clinician registry' — none of which appear in any of the 225 listed modules or 7 top-level functions; the concern is about hy

### d_2_0  (none - loop 2)
> `joinStudy` re-consent for a revoked participant may silently re-enable data export if consent state transitions are not explicitly gated, creating a compliance gap

No resolution strategy could handle this dissent

### d_2_1  (judgement - loop 2)
> Using a denylist (exclude specific fields) instead of an allowlist for pack serialization would cause any newly added domain field to leak into exported packs by default

The concern is about a denylist vs allowlist pattern in pack serialization, but none of the 225 listed modules or 7 top-level functions correspond to pack serialization code, so no probe can be scoped

### d_2_2  (none - loop 2)
> If `nightsElapsed` is validated only at the serialization boundary rather than at the point of creation, invalid negative values could persist in the local store and surface in UX

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_2  (code_reading - loop 1)
> The allowlist approach for study pack serialization will silently drop any newly added fields unless the allowlist is updated in lockstep with schema changes, which could cause data loss in future iterations if the process is not enforced by CI.

Reading the source settles this. Read src/app/api/study/route.ts. The serialization uses `JSON.stringify(parsed.value, null, 2)` with no replacer/allowlist, so it serializes all fields present in `parsed.value` rather than filtering to an explicit set of field names. Cited src/app/api/study/route.ts:72: `await writeFile(file, JSON.stringify(parsed.value, null, 2), { encoding: "utf8", mode: 0o600 });`

`probe: read_code__study_pack_serialization_allowlist_8612`

### d_1_3  (semantic_bridge - loop 1)
> If legacy locally-minted participantIds exist in already-exported packs or analytics pipelines, the migration to Operator-minted codes may break join keys in downstream datasets unless a mapping table is maintained and backfilled.

Read src/app/api/study/route.ts. The serialization uses `JSON.stringify(parsed.value, null, 2)` with no replacer/allowlist, so it serializes all fields present in `parsed.value` rather than filtering to an explicit set of field names. Cited src/app/api/study/route.ts:72: `await writeFile(file, JSON.stringify(parsed.value, null, 2), { encoding: "utf8", mode: 0o600 });`

`probe: read_code__study_pack_serialization_allowlist_8612`

### d_2_3  (no_resolver - loop 2)
> The migration path for existing app-minted participantIds to Operator invite codes assumes a 1:1 mapping exists; if some participants were enrolled without invite codes, their records become orphaned

No resolution strategy could handle this dissent

### d_2_3  (semantic_bridge_weak - loop 2)
> The migration path for existing app-minted participantIds to Operator invite codes assumes a 1:1 mapping exists; if some participants were enrolled without invite codes, their records become orphaned


`probe: read_code__study_pack_serialization_allowlist_8612`
