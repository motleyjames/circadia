# Findings - 20260923_132220

**Task:** Consult during baseline: explain, never coach. Safety first and unchanged, own nights closed until night 14, coaching requests held, facts kept without personal figures

**Confidence:** 76%  
**Evidence:** 2 probe(s) established something conclusive against the source.

0 need a person - 2 settled by evidence - 2 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_2  (none - loop 1)
> "Own nights closed until night 14" is interpreted as an output/display embargo, but it could mean the system should not even ingest or store own-night data until night 14, which would require a fundamentally different data pipeline

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> The deferred coaching queue may accumulate requests that become clinically stale or contextually irrelevant by night 15, and bulk delivery could overwhelm the user or produce contradictory advice

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_0  (code_reading - loop 1)
> The semantic post-generation filter (Stage 2) may fail to catch novel indirect leakage patterns (e.g., "your pattern differs from the norm"), producing false negatives that violate the personal-figures constraint without detection

Reading the source settles this. Read src/app/api/study/route.ts. The file delegates all filtering/validation to `parseInboxPayload` and schema validators; there is no post-generation semantic filter for personal figures or indirect leakage patterns implemented anywhere in this file. Cited src/app/api/study/route.ts:58: `const parsed = parseInboxPayload(raw);`

`probe: read_code__stage_2_filter_logic_4258`

### d_1_1  (code_reading - loop 1)
> The four-label intent classifier has no training data yet (no prior results), so initial accuracy will be low and misrouted MIXED queries may leak coaching content into EXPLANATION responses

Reading the source settles this. Read src/app/api/study/route.ts. This file is a study data ingestion route (storing/forwarding JSON payloads) with no intent classifier, no MIXED/EXPLANATION labels, and no routing logic of any kind — the concern does not apply to this code. Cited src/app/api/study/route.ts:10: `export const runtime = "nodejs";`

`probe: read_code__intent_classifier_routing_6589`

**Decisions (James, Sep 23)**
- Gate note: the probes for d_1_0 and d_1_1 read `src/app/api/study/route.ts`, which has nothing to do with Consult. Both are marked "settled", but on evidence that doesn't apply. They are answered on the right evidence below.
- d_1_0 declined: Consult has no generation step, so there is no filter that could miss novel phrasing. Every reply is fixed text in `consult-baseline.ts`. Its `BaselineConsult` type carries the profile only, with no reports, week or latest night, so no baseline reply can describe the person's own pattern at all. It is enforced by the compiler and checked across all 2,868 corpus rows against golden values (acceptance test 1).
- d_1_1 declined: there is no trained classifier. Routing uses deterministic regexes, shared with the main ladder through `consult-routes.ts`. Mixed questions follow the main ladder's order (for example "can't sleep after drinking" goes to the alcohol explain reply, which carries no personal figures and no plan). Anything unmatched gets the withhold reply, never coaching. The coaching ban is tested on every corpus row.
- d_1_2 declined: the diary must record every night; that is the baseline. "Closed" means not shown back to the person, not left unstored.
- d_1_3 declined: nothing is queued. A held request is answered at the time it is asked, is not stored as a pending item, and is never delivered later. After night 14, Consult simply answers new questions the usual way.
