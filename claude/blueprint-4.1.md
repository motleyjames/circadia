# Somnadia — blueprint 4.1

Status: **decided, Sep 22 2026.** Supersedes the build order in `blueprint-4.0-three-surfaces.md`, whose three surfaces and principles still stand. Open questions marked ▶.

## What changed since 4.0

- **The name is Somnadia.** Every visible surface is renamed; every identity is frozen (AGENTS.md).
- **Two competitors are known.** Organa (scored CSD data for clinicians, $18–25 per seat, Dr. Carney's partner) and NOCTEM Health (COAST: funded, RCT-validated, insurance-billable, already engages patients before the first visit). Somnadia's difference is **unproven**; five clinician conversations by **Oct 9** decide it, with a go/no-go on **Oct 10**.
- **Shipped since 4.0:** night geometry, solo enrollment, the shakedown console, sealed pack transport, consent with an under-18 gate, and withdrawal that deletes.

---

## The organising principle: observation

> **During a baseline, nothing in Somnadia may change the sleep it is measuring.**

A person with insomnia comes for a clinician's help. The baseline is the clinician's evidence: fourteen nights of how this person *usually* sleeps. If the app nudges them — an evening ping, a nightly number, a score to improve — they start fixing it themselves, and the clinician is handed a baseline of a person who was being coached by an app.

[WHY this is the rule, not a preference: a baseline that the instrument has changed is not a baseline. It misleads the one person whose judgment the patient came for.]

Five consequences, each a rule:

1. **No numbers about their sleep** while in baseline — not efficiency, not latency, not averages. Not on Tonight, not in Notes, not after filing.
2. **No evening notifications** in baseline. The morning reminder is the only ping.
3. **No sleep advice pushed** in baseline. The library, meditations and Consult stay available if the person goes looking; Tonight does not promote them.
4. **The diary asks only what the clinician needs**, in under a minute.
5. **The diary never teaches the person to watch the clock.**

Outside an episode, the app behaves as it does today. ▶ Whether that should change is a question for after the clinician conversations.

---

## Diary 2.0 — the morning

**Target:** median under 60 seconds, measured. One question per screen. Each screen answerable with one tap on a typical morning.

### 1. Your night
One night bar with four handles: **into bed · tried to sleep · final wake · out of bed.** Pre-filled from the person's usual times. A single **Same as usual** confirms all four.

[WHY one picture: it is the same raster the clinician reads. The person draws the page the clinician will review. It is also faster and less error-prone than four separate clock pickers.]

### 2. Falling asleep
> *How long did it take to fall asleep?*
> *Your best guess is fine. Please don't check a clock tonight to get this right.*

Duration chips: **under 10 · 10 · 20 · 30 · 45 · 1 h · 1½ h · 2 h · 3 h or more.**

[WHY the second line: clock-watching perpetuates insomnia. The instruction turns the diary itself into part of the treatment, and it is how the Consensus Sleep Diary asks.]

### 3. During the night
> *After falling asleep, how many times did you wake up?* **None · 1 · 2 · 3 · 4 or more**

Only if they woke: *In total, how long were you awake?* — the same duration chips.

### 4. Quality
> *How would you rate your sleep?* **Very poor · Poor · Fair · Good · Very good**

### 5. Anything different yesterday?
One row of chips: **Nap · Alcohol · Caffeine after 2 pm · Sleep aid · Nothing.**
**Nothing** ends the diary. Each tapped chip opens exactly one follow-up:
- Nap → how long
- Alcohol → how many drinks: **1 · 2 · 3 · 4 or more**
- Caffeine after 2 pm → nothing further
- Sleep aid → which kind, from the existing class list

### After filing
> **Night 3 of 14 recorded.**

The 14-slot strip, filled to date. Nothing else. At night 7: *Halfway through your baseline.* At night 14: *Your baseline is complete. Thank you.* — in the app, not as notifications.

### Removed from the daily diary
Dreams · whether the room spun · screen-off minutes · whether a wind-down helped · free choice of supplement. The features they came from stay in the app; they are no longer asked every morning.

### The ceiling bug this fixes
Time to fall asleep currently tops out at **75 minutes**, and time awake in the night likely has a similar cap. Someone who lay awake three hours can only report 75, so their sleep efficiency is **overstated — exactly for the people the app exists for.** The new chips reach 3 hours or more.

- Durations are stored in minutes. **"3 hours or more" is stored as 180 and marked as a floor**, so no report ever claims a longer night was 180 minutes exactly.
- Old nights keep their bucketed values and remain readable. The export marks which format a night used.
- Finer durations are also closer to the original diary's format — one less alteration to disclose to Dr. Carney.

---

## What leaves the device

Dropped from every pack: **meditation count, soundscape count, wind-downs finished, Consult count, library topics**, plus the removed diary items. Nights filed before this change keep the fields they have.

Added: **caffeine after 2 pm** (yes/no), and duration values beyond the old buckets.

Because the consent's "What Somnadia receives" list is generated from the disclosure map, it shrinks automatically. **`CONSENT_VERSION` becomes 3:** what a tester agreed to has changed, even if only by becoming less.

▶ Profile fields — sex, body-size group, activity level — are unchanged. Revisit after the clinician conversations, keeping only what a clinician says they use.

**Rollout is receiver before sender.** New duration values and the caffeine field would fail today's validators. Both receivers must accept them, and still accept old packs, before any phone sends them: Mac first, phone second.

---

## Notifications in baseline

| When | Text | Only if |
|---|---|---|
| Usual out-of-bed time + 30 min | **Last night** — *While it's fresh. About a minute.* | the morning is unfiled |

That is the whole set during a baseline. **Screens down** and **Your week is in** are retired.

The existing rules stand: nothing between bedtime and morning, complete on the lock screen, no streaks or guilt, ask permission late, and the test ping.

### Later, in treatment (designed, not built)
Two anchors, both from the clinician's window:
- *Your window opens at 11:30. Stay up until you're sleepy.*
- *Up at 6:30, even after a rough night.*

[WHY only these: a fixed rise time and not going to bed before sleepy are the two instructions CBT-I depends on most. Every other reminder is noise.]

---

## Tonight in baseline

The countdown goes. In its place:

> **Night 6 of 14**
> Nothing to change tonight. Sleep the way you usually do — that's what your clinician needs to see.

During the shakedown, with no clinician: *…that's what this test needs to see.* Guided meditations and Consult move below the fold, available but not promoted.

## Notes in baseline

> **Your notes open after night 14.**
> Until then, Somnadia keeps your diary without showing you numbers, so your baseline stays yours.

After night 14, Notes opens as it does today.

---

## Build order

**Next — before the first stranger joins:**
1. **Diary 2.0**, with receiver-first validators, the ceiling fix and the pack trim. Consent version 3.
2. **Baseline notifications and the observation rules** — Tonight, Notes, the after-filing screen.

Why before strangers: changing the instrument mid-shakedown would split the data into two formats.

**After Oct 10, shaped by the clinician conversations:** intake questionnaires (STOP-BANG, PROMIS), the 14-night export, the treatment-phase window and its two anchors, and the clinic demo.

**Small, whenever:** hide the delete link on rows with no nights; "Remove from list" for withdrawn testers; move destructive actions off the triage view; replace the `"Not a Somnadia file."` sentinel with an error code; the launcher should wait for the surface page itself, not just a response; fix "1 minutes."

## Not code

1. **Five clinician conversations by Oct 9.** Show them the design canvas.
2. **Dr. Carney** — after the positioning is settled; name Organa; disclose the remaining alterations.
3. **TestFlight** — create the App Store Connect record with bundle ID `app.circadia.diary` and name Somnadia.
4. **FTC Health Breach Notification Rule** — check applicability before strangers.
5. **CU's Entrepreneurial Law Clinic** — trademark clearance for Somnadia.
6. **Within 30 days of the shakedown ending** — delete all study data, as promised.

## Anti-goals

- No numbers about their sleep during baseline, in any form.
- No evening pings during baseline.
- No score, streak or grade, ever.
- No titration suggestions. Carried from 4.0.
- No free text in a pack. No crisis or mania signal, in any form.
