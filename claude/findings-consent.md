# Findings - 20260922_192202

**Task:** Somnadia is local-first. This change adds consent and an under-18 gate, and makes leaving delete a tester's nights from Operator. Nothing a pack contains changes.

**Confidence:** 52%  
**Evidence:** 2 probe(s) established something conclusive against the source.

1 need a person - 1 settled by evidence - 2 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_1_1  (code_reading - loop 1)
> If the user uninstalls the app immediately after tapping "leave" but before the DELETE request completes (or while offline), nights may persist indefinitely on Operator unless a server-side TTL or periodic sweep is implemented — and no council member specified a concrete TTL value or sweep interval.

Reading the source CONFIRMS this concern. Read src/app/api/study/route.ts. The route only writes JSON files to disk with no TTL field, expiry timestamp, or scheduled sweep mechanism, meaning orphaned entries will persist indefinitely if a DELETE request never completes. Cited src/app/api/study/route.ts:75: `await writeFile(file, JSON.stringify(parsed.value, null, 2), { encoding: "utf8", mode: 0o600 });`

`probe: read_code__ttl_or_sweep_logic_5078`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_2  (none - loop 1)
> The task says "nothing a pack contains changes," but if nights are referenced or indexed within pack structures (e.g., a pack tracks which nights used it), the deletion of nights from Operator could leave dangling references in Operator-side pack-related indexes, violating referential integrity.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> Storing `consent_granted` only locally means there is no server-side record that consent was ever given, which may fail audit requirements under GDPR Article 7(1) ("the controller shall be able to demonstrate that the data subject has consented").

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_0  (code_reading - loop 1)
> A simple boolean "Are you 18+" attestation without DOB collection may not satisfy COPPA or EU GDPR-K age verification requirements, meaning the age gate could be legally insufficient depending on jurisdiction.

Reading the source settles this. Read src/components/consent-screen.tsx. The component only presents a checkbox attestation labeled 'I'm 18 or older' — no date of birth field is collected. Cited src/components/consent-screen.tsx:130: `I&apos;m 18 or older.`

`probe: read_code__age_gate_mechanism_5256`
