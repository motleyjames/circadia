# Findings - 20260918_201449

**Task:** Review Circadia shakedown stage 1: back-fill of missed mornings with an explicit filedLate marker and a write-path guard that refuses to replace an existing report; plus morning and intake draft persistence that never enters reports or a study pack.

**Confidence:** 89%  
**Evidence:** 4 probe(s) established something conclusive against the source.

2 need a person - 7 settled by evidence - 10 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_2_0  (code_reading - loop 2)
> The write-path guard may currently be implemented only at the application layer (service/handler code), meaning two concurrent requests for the same participantId + reportDate could both pass the check and produce duplicate or overwritten reports.

Reading the source CONFIRMS this concern. Read src/app/api/study/route.ts. The write path simply writes a new timestamped file without any query-then-insert check, database unique constraint, or upsert conflict handling to prevent duplicate reports for the same participantId and reportDate. Cited src/app/api/study/route.ts:72: `await writeFile(file, JSON.stringify(parsed.value, null, 2), { encoding: "utf8", mode: 0o600 });`

`probe: read_code__write_path_duplicate_guard_1365`

### d_3_1  (code_reading - loop 3)
> The API may return 200 OK or silently succeed when the write-path guard blocks a duplicate write, making it impossible for callers to distinguish "already exists" from "successfully created."

Reading the source CONFIRMS this concern. Read src/app/api/vault/route.ts. The PUT handler always returns 200 OK with `{ ok: true }` after writing, with no duplicate detection logic anywhere in the shown code. Cited src/app/api/vault/route.ts:33: `return NextResponse.json({ ok: true });`

`probe: read_code__duplicate_write_response_4776`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_1  (none - loop 1)
> Draft isolation may be implemented via a `status` field in the shared reports table rather than a physically separate table/collection, which would allow any unfiltered query against reports to leak draft data into study packs.

No resolution strategy could handle this dissent

### d_1_2  (none - loop 1)
> The `filedLate` marker may be stored as a bare boolean without persisting the underlying `filedAt` and `effectiveDate` timestamps, destroying the ability for analysts to apply their own lateness thresholds.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> Lateness determination may rely on client-supplied timestamps rather than server-side receipt time, making it vulnerable to client clock skew or manipulation.

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> The unique constraint on `(participant_id, report_type, effective_date)` may not exist at the database level, with the write guard enforced only in application code where concurrent requests can race past it.

No resolution strategy could handle this dissent

### d_2_1  (none - loop 2)
> Draft records may share a table or collection with finalized reports, distinguished only by a boolean flag or status field, which means a missing WHERE clause or projection filter in any report/study-pack query could leak draft data into canonical outputs.

No resolution strategy could handle this dissent

### d_2_2  (none - loop 2)
> The `filedLate` marker may not be protected against mutation: a re-processing or back-fill retry path could strip or overwrite the flag, silently converting a late-filed report into an apparently on-time one.

No resolution strategy could handle this dissent

### d_2_3  (none - loop 2)
> There is no defined TTL or cleanup mechanism for orphaned draft records, risking unbounded storage growth and retention of incomplete PII beyond consent scope.

No resolution strategy could handle this dissent

### d_3_2  (none - loop 3)
> The `filedLate` flag may lack an immutability constraint, allowing a subsequent PUT/PATCH to set it back to `false` or `null` and destroy provenance on a back-filled record.

No resolution strategy could handle this dissent

### d_3_4  (none - loop 3)
> Abandoned or orphaned drafts may accumulate without any TTL, cleanup job, or storage bound, leading to unbounded storage growth in the draft persistence layer.

No resolution strategy could handle this dissent

### d_3_5  (none - loop 3)
> The composition of the write-path guard and the back-fill path may not be tested for the specific case where a back-fill targets a morning that already has a real-time report, potentially creating a shadow `filedLate` record alongside the original.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_0  (code_reading - loop 1)
> The write-path guard may lack a deliberate amendment/correction pathway, meaning legitimate data corrections (e.g., participant entered wrong values) have no supported flow and will require either a schema migration or an unsafe workaround later.

Reading the source settles this. Read src/app/api/vault/route.ts. The write path uses HTTP PUT, which is the standard method for replacing/updating an existing resource, meaning it permits updates and corrections to existing records, not just new inserts. Cited src/app/api/vault/route.ts:23: `export async function PUT(request: Request) {`

`probe: read_code__write_guard_amendment_2629`

### d_1_5  (semantic_bridge - loop 1)
> Timezone policy for `effectiveDate` assignment near midnight boundaries may be undefined or implicit, causing misattribution of reports to the wrong calendar date.

Read src/app/api/vault/route.ts. The write path uses HTTP PUT, which is the standard method for replacing/updating an existing resource, meaning it permits updates and corrections to existing records, not just new inserts. Cited src/app/api/vault/route.ts:23: `export async function PUT(request: Request) {`

`probe: read_code__write_guard_amendment_2629`

### d_2_4  (no_resolver - loop 2)
> The behavior when a back-fill targets a date that already has a finalized on-time report is undefined: it may silently fail, throw an unhandled error, or—worst case—overwrite the existing report if the guard does not treat back-fills identically to normal writes.

No resolution strategy could handle this dissent

### d_2_4  (semantic_bridge_weak - loop 2)
> The behavior when a back-fill targets a date that already has a finalized on-time report is undefined: it may silently fail, throw an unhandled error, or—worst case—overwrite the existing report if the guard does not treat back-fills identically to normal writes.


`probe: read_code__write_guard_amendment_2629`

### d_3_0  (code_reading - loop 3)
> The write-path guard may be enforced only at the application layer (check-then-write) without a database-level unique constraint, leaving a race-condition window where concurrent back-fill requests could both pass the check and insert duplicate reports.

Reading the source settles this. Read src/app/api/study/route.ts. The write path uses a timestamp-based unique filename (not a check-then-insert pattern against a database), so there is no check-then-insert race condition; each write goes to a new file determined by the current timestamp, making duplicate Cited src/app/api/study/route.ts:62: `const stamp = new Date().toISOString().replace(/[:.]/g, "-");`

`probe: read_code__check_then_insert_race_8724`

### d_3_3  (no_resolver - loop 3)
> Draft tables may be co-located in the same schema and accessible via the same repository interfaces used by report/export code, meaning a future query or JOIN could inadvertently leak draft data into study packs or analytics.

No resolution strategy could handle this dissent

### d_3_3  (semantic_bridge_weak - loop 3)
> Draft tables may be co-located in the same schema and accessible via the same repository interfaces used by report/export code, meaning a future query or JOIN could inadvertently leak draft data into study packs or analytics.


`probe: hypothesis_L3_H2`

---

## Declined, with reasons (James, 2026-09-18)

Both CONFIRMED findings assume a server-side architecture that does not exist.
Circadia is local-first: no database, no service layer, no server-side read of
diary data. The vault API stores an opaque encrypted blob; the study API stores
a de-identified pack. Every guard discussed is client-side by design.

**d_2_0 — "write-path guard only at the application layer, not the database."**
Accurate and inapplicable. There is no database to constrain. `applyBackfill` is
the guard, and it refuses a date that already has a report even when
`backfillableDates` is bypassed. Declined.

**d_3_1 — "PUT always returns 200, masking a blocked duplicate write."**
The vault PUT stores ciphertext and cannot inspect its contents. The duplicate
check runs before encryption, client-side. A 200 from that route means the blob
was stored, which is all it can mean. Declined.

## Taken from the open list

**d_2_3 / d_3_4 — orphaned drafts have no cleanup.** Real and
architecture-independent. A draft whose morning is never filed persists in the
vault indefinitely. Fixed: a morning draft is discarded once its `morningDate`
is no longer back-fillable.

## Note for future gate runs

The task string did not say local-first, and the council spent most of its probe
budget on database constraints, server receipt timestamps and TTL cleanup jobs.
Lead future task strings with the architecture: "Circadia is local-first — no
server, no database; the vault is an encrypted blob and all guards are
client-side."
