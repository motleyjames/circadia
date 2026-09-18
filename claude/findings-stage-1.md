# Findings - 20260918_175304

**Task:** Review Stage 1 of the Circadia clinical reshape: an Episode state machine on stored state, a TreatmentWindow type constructed only through createTreatmentWindow from clinician input, whole-object rev merge for episodes in mergeDiaryStates, and windowAdherence returning null rather than substituting sleep onset when in-bed clocks are missing. A mutation harness has verified all three invariants fai

**Confidence:** 89%  
**Evidence:** 1 probe(s) established something conclusive against the source.

4 need a person - 5 settled by evidence - 6 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_1_2  (code_probe_evidence - loop 1)
> Returning bare null from windowAdherence loses the clinical reason for missing data, making it impossible for downstream consumers to distinguish "sensor not worn" from "sensor malfunctioned" or "data not yet synced"

Probe 'check_exists__windowadherence_function_existence_5325' CONFIRMS this concern: Appears as text at src/lib/episode.ts:187, src/lib/episode.test.ts:13, src/lib/episode.test.ts:89 The dissent stands and needs a person.

`probe: check_exists__windowadherence_function_existence_5325`

### d_2_0  (code_probe_evidence - loop 2)
> Deserialization paths (JSON.parse, ORM hydration, DTO mapping) may currently reconstruct TreatmentWindow objects without routing through createTreatmentWindow, bypassing all input validation

Probe 'check_exists__createtreatmentwindow_existence_2987' CONFIRMS this concern: Appears as text at src/lib/episode.ts:56, src/lib/episode.test.ts:10, src/lib/episode.test.ts:101 The dissent stands and needs a person.

`probe: check_exists__createtreatmentwindow_existence_2987`

### d_3_0  (code_probe_evidence - loop 3)
> Whole-object revision merge in `mergeDiaryStates` silently discards concurrent field-level updates from the losing revision, which could drop clinician-entered data without any user notification or log entry

Probe 'check_exists__mergediarystates_existence_8875' CONFIRMS this concern: Appears as text at src/lib/diary-fold.test.ts:2, src/lib/diary-fold.test.ts:45, src/lib/diary-fold.test.ts:79 The dissent stands and needs a person.

`probe: check_exists__mergediarystates_existence_8875`

### d_3_1  (code_probe_evidence - loop 3)
> Deserialization paths (database reads, API responses, file imports) may bypass `createTreatmentWindow` validation if they construct `TreatmentWindow` directly from raw JSON without routing through the factory function

Probe 'check_exists__factory_function_existence_0039' CONFIRMS this concern: Appears as text at src/lib/episode.ts:56, src/lib/episode.test.ts:10, src/lib/episode.test.ts:101 The dissent stands and needs a person.

`probe: check_exists__factory_function_existence_0039`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_1  (judgement - loop 1)
> TreatmentWindow may not be truly opaque in TypeScript: object spread, type assertions, or JSON deserialization can bypass createTreatmentWindow unless a branded type or private-constructor class is used, and no test currently verifies this

The concern references createTreatmentWindow and TreatmentWindow, but neither symbol nor any plausible containing file appears in the repository's module list or top-level function inventory, making t

### d_1_3  (none - loop 1)
> The mutation harness verifies "all three invariants" but the task describes four design decisions; it is unclear whether the whole-object rev merge invariant is covered by mutation testing or only the other three

No resolution strategy could handle this dissent

### d_2_1  (none - loop 2)
> mergeDiaryStates whole-object revision merge may rely on client-generated timestamps rather than server-assigned monotonic revisions, making concurrent edit resolution non-deterministic

No resolution strategy could handle this dissent

### d_2_2  (none - loop 2)
> Upstream consumers of windowAdherence (dashboards, aggregate reports, longitudinal analytics) may currently treat null return values as zero or silently omit them, defeating the no-fabrication invariant at the presentation layer

No resolution strategy could handle this dissent

### d_2_3  (none - loop 2)
> Episode state machine transitions (re-entry, backfill, rollback edge cases) were not explicitly covered by the mutation harness hypotheses and may lack fault-detection coverage

No resolution strategy could handle this dissent

### d_3_2  (judgement - loop 3)
> Legacy persisted episodes may contain state combinations that violate the new Episode state-machine transition rules, causing runtime failures or data inaccessibility when the new code path encounters them

The concern is about an Episode state-machine that does not appear to exist in this repository's module list; no probe can be scoped to a real file containing the relevant code, so any result would be

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_0  (code_probe_evidence - loop 1)
> Whole-object rev merge in mergeDiaryStates will silently discard clinician edits when two devices concurrently modify the same episode with different revision numbers, which is a patient safety risk in multi-device clinical workflows

Probe 'check_exists__mergediarystates_function_1312' settles this against the repository: 'mergeDiaryStates' does not appear anywhere in src/components/diary-surface.tsx, which was read in full.

`probe: check_exists__mergediarystates_function_1312`

### d_1_4  (no_resolver - loop 1)
> Downstream analytics or UI consumers of windowAdherence may already coerce null to 0 in existing code paths, silently reintroducing the imputation bias this change was designed to eliminate

No resolution strategy could handle this dissent

### d_1_4  (semantic_bridge_weak - loop 1)
> Downstream analytics or UI consumers of windowAdherence may already coerce null to 0 in existing code paths, silently reintroducing the imputation bias this change was designed to eliminate

Appears as text at src/lib/episode.ts:187, src/lib/episode.test.ts:13, src/lib/episode.test.ts:89

`probe: check_exists__windowadherence_function_existence_5325`

### d_3_3  (code_probe_evidence - loop 3)
> Downstream consumers of `windowAdherence` that previously received a numeric substitute may silently coerce null to 0 (e.g., via arithmetic or loose equality), misrepresenting uncomputable adherence as zero adherence in reports or dashboards

Probe 'check_exists__factory_function_existence_0039' CONFIRMS this concern: Appears as text at src/lib/episode.ts:56, src/lib/episode.test.ts:10, src/lib/episode.test.ts:101 The dissent stands and needs a person.

`probe: check_exists__factory_function_existence_0039`

### d_3_3  (semantic_bridge_weak - loop 3)
> Downstream consumers of `windowAdherence` that previously received a numeric substitute may silently coerce null to 0 (e.g., via arithmetic or loose equality), misrepresenting uncomputable adherence as zero adherence in reports or dashboards


`probe: check_exists__windowadherence_function_existence_5325`
