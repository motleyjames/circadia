# Findings - 20260923_123447

**Task:** Blueprint 4.1 part two: observation during baseline. Morning-only notifications, Tonight shows Night N of 14, Notes closed until night 14

**Confidence:** 62%  
**Evidence:** 1 probe(s) established something conclusive against the source.

0 need a person - 2 settled by evidence - 2 open.

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> Unlocking Notes on Night 14's evening (before the final sleep) contaminates the last night's baseline data because self-reflection before sleep introduces a reactive measurement effect; the unlock should default to the morning after Night 14 unless explicitly overridden by the protocol owner

No resolution strategy could handle this dissent

### d_1_1  (none - loop 1)
> Calendar-based night advancement without requiring a completion event will count nights where the user never opened the app or wore the device, producing baseline periods with missing data that downstream analysis may incorrectly treat as complete

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_2  (code_reading - loop 1)
> A single morning notification window of 06:00–10:00 will fire at inappropriate times for shift workers or users with non-standard sleep schedules, producing low engagement or irritation unless the onboarding flow captures the user's typical wake window

Reading the source settles this. Read src/components/onboarding.tsx (truncated). Step 2 (Wake time) explicitly presents a time input field that lets the user set their own wake time, which is then used to derive targetSleep and targetWake saved to the profile — there is no fixed 06:00–10:00 notification window imposed w Cited src/components/onboarding.tsx:275: `<Input`

`probe: read_code__onboarding_wake_window_1130`

### d_1_3  (semantic_bridge - loop 1)
> If the notification policy filter only suppresses new scheduling but does not retroactively cancel pre-existing queued evening jobs (e.g., from a prior phase or default app setup), users will still receive evening notifications during baseline

Read src/components/onboarding.tsx (truncated). Step 2 (Wake time) explicitly presents a time input field that lets the user set their own wake time, which is then used to derive targetSleep and targetWake saved to the profile — there is no fixed 06:00–10:00 notification window imposed w Cited src/components/onboarding.tsx:275: `<Input`

`probe: read_code__onboarding_wake_window_1130`

**Decisions (James, Sep 23)**
- d_1_0 declined: Notes does not open on night 14's evening. Observation ends only when the morning that closes night 14 (slot 13) is filed, or on the day after that morning if it is never filed. Both are after the final sleep. Tested in `src/lib/observation.test.ts` ("is false the moment the slot-13 morning is filed").
- d_1_1 declined, calendar kept: the baseline is nights 1–14 by the calendar. A missed morning is a gap, not an extension, so the no-numbers period has a known end date for the tester and the clinician. Missing nights are absent from the pack rather than counted as filed, and Operator reports completion as filed over elapsed.
- d_1_2 accepted as settled: the wake time comes from the person's own profile. The baseline morning ping is at their wake time + 30 minutes, not in a fixed window.
- d_1_3 declined, and the gate's evidence was wrong: it cited the onboarding wake-time input, which has nothing to do with this dissent. The real answer is `syncNotifications` in `src/lib/notify-device.ts`, which cancels every pending notification (`clearScheduled`) before it schedules the new plan. It runs on the first launch after install and whenever `notifyKeyFor(state)` changes, and that key now includes the episode. So evening pings queued by 0.17.0 are removed the first time 0.18.0 opens. Remaining gap: a tester who never opens the app after updating keeps those old pings until they do.
