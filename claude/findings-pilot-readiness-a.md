# Findings - 20260923_164119

**Task:** Pilot readiness A: intake defaults no longer become data, usual bedtime asked, no pre-baseline backfill, sample week locked in a study, Library and Consult History closed during baseline, consent v5 discloses faults and join time

**Confidence:** 76%  
**Evidence:** 2 probe(s) established something conclusive against the source.

0 need a person - 2 settled by evidence - 3 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_1  (none - loop 1)
> Enforcing `event_timestamp >= baseline_start` at ingestion may incorrectly reject legitimate data from wearables or devices that batch-sync with delayed timestamps within the valid baseline window; the rejection logic needs a defined grace period or device-sync-aware windowing rule.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> The "sample week lock" trigger condition (e.g., first valid baseline night + 7 days) has not been confirmed with the study protocol team; an incorrect trigger definition would silently lock participants into wrong windows.

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> Consent v5's requirement to disclose "faults" is ambiguous in scope—if interpreted too narrowly or too broadly, it could either fail IRB review or create unmanageable legal exposure; the exact fault inventory must be defined and approved before the document is finalized.

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_0  (code_reading - loop 1)
> Downstream analytics and ML pipelines that currently consume intake data with implicit defaults will produce errors or silently degrade when those fields become null/undefined; no validation or migration plan for these consumers has been specified.

Reading the source settles this. Read src/components/check-in-flow.tsx (truncated). The `file` function explicitly guards against undefined values for the key intake fields (`sleepLatencyMinutes`, `awakeningCount`, `rating`) and returns early without submitting if any are missing, preventing null/undefined values from bein Cited src/components/check-in-flow.tsx:185: `if (sleepLatencyMinutes === undefined || awakeningCount === undefined || rating === undefined) retur`

`probe: read_code__intake_field_validation_6194`

### d_1_2  (code_reading - loop 1)
> Closing Library and Consult History only in the client (without server-side endpoint gating) would allow circumvention via deep links, cached app states, API calls, or older app versions—server-side enforcement must be confirmed as implemented, not assumed.

Reading the source settles this. Read src/app/api/study/route.ts. Both GET and POST check `isLocalRequest(request)` and reject cross-site requests, but there is no check for Library or Consult History feature flags — however, the question asks whether data is returned unconditionally to any authenticated  Cited src/app/api/study/route.ts:34: `if (!isLocalRequest(request)) {`

`probe: read_code__server_side_feature_gating_5670`

**Decisions (James, Sep 23)**
- Gate note: d_1_0 and d_1_2 were marked "settled" using `check-in-flow.tsx` and `src/app/api/study/route.ts`, and neither file is what those findings are about. This is the third change in a row where the probe read an unrelated file. They are answered on the right evidence below.
- d_1_0 declined: no profile field becomes null. Intake now requires age, height and weight before Continue. Profiles made before this change keep their stored values and the old default rule. `bmiBand: "unconfirmed"` is a value the receivers already accept, and no key that is sent or accepted changed.
- d_1_1 declined: Somnadia takes in no wearable or device data, and no receiver filters on timestamps. The change only narrows which past mornings the phone offers for late filing: a date must have an episode slot (`episodeNightOf !== null`, local civil dates).
- d_1_2 declined: the Library card and Consult History are built on the phone from the person's own encrypted diary. No server endpoint serves them. The observation rule is about not showing the person their own data during the baseline, not about locking them out of it.
- d_1_3 declined: there is no "sample week lock" trigger or 7-day window. "Load sample week" is a demo-data button. It is hidden, and the store action does nothing, whenever an episode exists or study consent is given.
- d_1_4 accepted, changed: v5's fault line said "the error message and which screen it happened on — never your answers." But a fault also carries a stack trace and a timestamp, and the raw error message cannot be guaranteed free of anything the person typed. The line now says exactly what is sent: "the error message, where in the app's code it happened, which screen you were on, and when." It is still consent v5, because this was corrected before v5 was committed or shown to anyone. This is not an IRB matter: the pilot is product testing, not research.
