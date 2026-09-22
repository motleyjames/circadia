# Findings - 20260922_133036

**Task:** Circadia is local-first. Review two Operator changes. First, a tester's nights now come from their newest pack only, never merged across packs; a pack with fewer nights than the one before is named in data health until the next pack stops shrinking; completion can never exceed 100%. Second, Operator tabs switch without a document reload through a shared layout that keeps inbox data in memory, show

**Confidence:** 62%  
**Evidence:** 1 probe(s) established something conclusive against the source.

0 need a person - 2 settled by evidence - 3 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_1  (none - loop 1)
> If the completion denominator (target nights) can be zero or null for a new/uninitialized pack, `nights / target * 100` will produce a division-by-zero or NaN that the 100% clamp alone does not prevent.

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> Retaining inbox data in memory across all tab switches without a bounded eviction policy will cause unbounded memory growth for Operators with large inboxes or long sessions.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> A tab-switch-triggered Worker pull that fires immediately after a 3-minute poll response has already been applied will produce a redundant server request and a potential race condition if both responses write to the same reactive store without version gating.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_0  (code_reading - loop 1)
> Out-of-order pack sync (e.g., an older pack arriving after a newer one due to network delay) will falsely trigger the shrinkage data-health flag if pack recency is determined by client-side ingest time rather than a monotonic sequence number assigned at the source.

Reading the source settles this. Read src/app/api/fold-inbox/route.ts. The code uses filesystem stat to inspect files and a content-based digest for identification, with no use of Date.now(), new Date(), or any sequence number for recency ordering or health/shrinkage flags. Cited src/app/api/fold-inbox/route.ts:29: `const info = await stat(file);`

`probe: read_code__pack_recency_determination_7229`

### d_1_4  (semantic_bridge - loop 1)
> Existing testers whose nights are currently merged across multiple packs will lose visible night data when the newest-pack-only rule activates, with no migration path specified to archive or surface the historical merged view.

Read src/app/api/fold-inbox/route.ts. The code uses filesystem stat to inspect files and a content-based digest for identification, with no use of Date.now(), new Date(), or any sequence number for recency ordering or health/shrinkage flags. Cited src/app/api/fold-inbox/route.ts:29: `const info = await stat(file);`

`probe: read_code__pack_recency_determination_7229`
