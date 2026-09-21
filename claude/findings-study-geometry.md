# Findings - 20260921_152132

**Task:** Circadia is local-first: study packs are de-identified and leave the device only with consent. Two changes. First, receiver before sender: both /api/study and electron/static-server.cjs accept optional CSD night geometry (inBedAt, triedToSleepAt, outOfBedAt, awakeningCount, napMinutes, filedLate) before any sender emits them; old nights stay valid; extra night keys stay rejected. Second, the anony

**Confidence:** 95%  
**Evidence:** 4 probe(s) established something conclusive against the source.

1 need a person - 6 settled by evidence - 2 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_2_1  (code_reading - loop 2)
> `Date.parse` accepts many non-date inputs as valid (e.g., `"1"` parses to a date in some engines), which could cause false-positive rejections of legitimate short string values; the confirmation step needs engine-specific validation or a stricter parser like a dedicated ISO-8601-only library.

Reading the source CONFIRMS this concern. Read electron/static-server.cjs. The code never calls Date.parse for input validation at all — the timestamp used in the filename is generated server-side from `new Date().toISOString()`, and no ISO-8601 regex or Date.parse check is applied to any caller-supplied date inpu Cited electron/static-server.cjs:183: `const stamp = new Date().toISOString().replace(/[:.]/g, "-");`

`probe: read_code__date_parse_validation_logic_4887`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_1  (none - loop 1)
> The anonymity scanner regex for civil dates will false-positive on semantic version strings like `"2024.1.15"` or user-entered text containing numeric sequences like `"room 2024, bed 12"` unless the regex is narrowly scoped to exact full-string or known-delimiter matches

No resolution strategy could handle this dissent

### d_2_4  (none - loop 2)
> `filedLate` as a boolean in de-identified study packs could serve as a quasi-identifier in small-N cohorts (e.g., a single late-filer in a 5-person study), and no mitigation is planned for the current release.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_2  (code_reading - loop 1)
> Rejecting `YYYY-MM-DD` patterns in all string values will break any existing payload field that currently carries a date string other than `morningDate` (e.g., `createdAt`, `updatedAt`, or metadata timestamps) that has not been inventoried and migrated to the top-level `at` allowlist or removed

Reading the source settles this. Read electron/static-server.cjs (whole file, focus on main). The code performs no YYYY-MM-DD pattern matching or stripping on string values at all — it only validates schema name, identity fields, night clock formats, and participant UUID, so there is no date-rejection logic that could affect created Cited electron/static-server.cjs:157: `if (!raw || typeof raw !== "object" || Array.isArray(raw)) {`

`probe: read_code__date_pattern_rejection_logic_3158`

### d_1_3  (semantic_bridge - loop 1)
> The single top-level `at` exception for roster and fault payloads assumes the scanner receives typed/discriminated payloads; if the scanner operates on raw JSON without payload-type metadata, it cannot correctly apply the allowlist and will either over-reject or under-reject

Read electron/static-server.cjs (whole file, focus on main). The code performs no YYYY-MM-DD pattern matching or stripping on string values at all — it only validates schema name, identity fields, night clock formats, and participant UUID, so there is no date-rejection logic that could affect created Cited electron/static-server.cjs:157: `if (!raw || typeof raw !== "object" || Array.isArray(raw)) {`

`probe: read_code__date_pattern_rejection_logic_3158`

### d_2_0  (code_reading - loop 2)
> The two-pass date detection (regex then `Date.parse`) will miss non-standard but human-readable date strings like `"Jan 15, 2024"` or `"15 January 2024"`, meaning the anonymity scanner may still leak civil dates in natural-language string values.

Reading the source settles this. Read electron/static-server.cjs. This file contains no date detection or anonymity scanner with regex or parsing logic for date strings — the only anonymity check is a simple field-name presence test for 'name', 'dream', 'email', and 'phone', with no date-string regex or n Cited electron/static-server.cjs:168: `if (schema === "circadia-study-v1" && ("name" in raw || "dream" in raw || "email" in raw || "phone" `

`probe: read_code__date_detection_logic_3951`

### d_2_2  (code_reading - loop 2)
> Using HH:mm strings for `inBedAt`/`triedToSleepAt`/`outOfBedAt` loses timezone and date context, making cross-midnight sleep duration computation ambiguous when the sleep window spans more than 12 hours or when DST transitions occur; numeric minutes-from-reference may be safer.

Reading the source settles this. Read electron/static-server.cjs. The file validates inBedAt, triedToSleepAt, and outOfBedAt as HH:mm strings but performs no cross-midnight sleep duration computation with them — it only stores/forwards the raw JSON after validation. Cited electron/static-server.cjs:35: `if (row.inBedAt !== undefined && !isStudyClock(row.inBedAt)) return false;`

`probe: read_code__hh_mm_sleep_time_handling_4018`

### d_2_3  (code_reading - loop 2)
> `additionalProperties: false` on the night schema will break any existing client that currently sends undocumented fields silently accepted by the old receiver; a production data audit for such fields must happen before enforcement, not after.

Reading the source settles this. Read electron/static-server.cjs. The file validates inBedAt, triedToSleepAt, and outOfBedAt as HH:mm strings but performs no cross-midnight sleep duration computation with them — it only stores/forwards the raw JSON after validation. Cited electron/static-server.cjs:35: `if (row.inBedAt !== undefined && !isStudyClock(row.inBedAt)) return false;`

`probe: read_code__hh_mm_sleep_time_handling_4018`

### d_2_3  (semantic_bridge_weak - loop 2)
> `additionalProperties: false` on the night schema will break any existing client that currently sends undocumented fields silently accepted by the old receiver; a production data audit for such fields must happen before enforcement, not after.


`probe: read_code__date_pattern_rejection_logic_3158`

---

## Declined, with reasons (James, 2026-09-21)

**d_2_1 — Date.parse accepts non-date inputs.** The cited evidence states the
code never calls Date.parse, which refutes the concern rather than confirming it.
The date check is a regex requiring a real month and day. The probe also read
electron/static-server.cjs; the scan lives in src/lib/study.ts. Declined.

**d_2_4 — filedLate as a quasi-identifier in a small cohort.** participantId
already links a tester's nights within the dataset, and a filed-late pattern
reveals nothing linkable to a real-world identity. Declined.

## Noted

**d_1_1 — date regex could false-positive on a date-shaped version string.**
True by design: appVersion "shipped-2026-12-25" is rejected by test. Harmless
while versions are semver. Revisit only if date-based versioning is adopted.

## Mutation finding

pack-se-drops-inBedAt survived. The round-trip test spread the original report
under the pack night, so a pack missing inBedAt inherited it. Invariant 1 still
guarded the code; invariant 3's test was decorative. Rewritten to use the pack
night alone.
