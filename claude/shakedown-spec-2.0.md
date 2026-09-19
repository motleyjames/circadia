# Circadia — instrument shakedown, spec v2.0 (design, not yet built)

Status: **for review.** No code written. Decisions James needs to make are marked ▶.
Companion to `clinical-reshape-spec-1.0.md` (Stage 1, shipped) and `sleep-data-spec-1.0.md`.

## What this phase is

An **instrument shakedown**, not a clinical pilot. The question being answered:

> Does a person with real insomnia complete 14 nights, and is the output professional
> enough to put in front of a sleep clinic?

Not *does this treat insomnia*. That question needs a clinician, an instrument that has
already proven it collects clean data, and probably an IRB. This phase earns the right to
ask it.

Two consequences run through every decision below:

1. **No clinician exists.** No `TreatmentWindow` is ever prescribed. Episodes run
   `enrolled → baseline → review` and stop. The treatment half of Stage 1 stays built,
   tested and dormant until a real clinic exists — which is correct, not wasted.
2. **The metric is completion, not content.** What the nights say matters far less than
   how many of them arrive.

## Cohorts

Testers will be a mix: friends, strangers with insomnia, and possibly CU students via the
Sleep and Chronobiology Lab. **Build for strangers** — they set the bar on consent,
safety and self-serve enrollment, and the other two then work by default.

`Episode.cohort: "friend" | "stranger" | "lab"` — set at enrollment, never shown to the
tester, always segmented in the completion report.

[WHY: friends complete out of loyalty. Averaging them with strangers produces a number
that predicts nothing about how a clinic's patients will behave, which is the only thing
this phase exists to learn.]

▶ **If lab recruits are in scope, ask about IRB in the first conversation.** Protocols are
normally approved before recruitment, so friend and stranger data collected first may not
be usable in anything the lab touches.

---

## 1. Solo enrollment

Stage 1 invariant 6 says an Episode cannot be created without a `clinicianId`. That now
blocks the only cohort you have. Resolve it without weakening the safety property:

```ts
type Episode = {
  ...
  clinicianId: ClinicianId | null;   // was: required
  cohort: Cohort;
  ...
};
```

Replace invariant 6 with two stronger ones:

- **A `TreatmentWindow` still requires a `clinicianId`.** `createTreatmentWindow` rejects
  a null one. Unchanged in substance.
- **An episode with `clinicianId: null` can never reach `treatment`.** `nextState` returns
  `review` and stays there.

[WHY this framing: the original invariant protected against a window with no author. It
did that by over-constraining the episode. The two replacements protect the same thing
and are each greppable and mutation-testable — add both to `scripts/mutations.json`.]

Enrollment is an invite code, not a signup flow. James generates codes; a tester enters
one and lands in `enrolled`.

▶ **Do testers see their own numbers during baseline?** A clinician withholds sleep
efficiency during the baseline, because seeing it changes behaviour — the orthosomnia risk
the `sleep-trackers` note already warns about. But an app that shows a tester nothing for
14 nights is an app they abandon on night 4. My lean: show the raster and the nights
filed, withhold SE and the week sentence until `review`. Decide before building the
Tonight screen.

## 2. Back-fill a missed morning

**The highest-value item in this phase.** Currently only today's morning can be filed, so
in a bounded 14-night baseline one missed morning is a permanently missing night. A real
insomniac will miss three. Without this, completion rate is capped by human forgetfulness
rather than by instrument quality — and completion rate is the whole experiment.

Design:

- A missed night within the episode window can be filed late.
- The report carries `filedLate: true` and `filedAt`.
- The raster and the export show which nights were reconstructed, visibly.
- **Never silently back-fill**, and never pre-populate from a neighbouring night.

▶ **How far back?** The CSD is a prospective diary — recall degrades fast, and a diary
filled from memory a week later is a questionnaire wearing a diary's clothes. My lean:
3 nights, marked. Beyond that, offer to skip rather than to guess.

[WHY mark it: a clinician reading the grid needs to know which rows are recall. An
unmarked back-fill is the same class of error as an estimated TIB — it silently degrades
the one thing the exercise exists to produce.]

## 3. Draft persistence

Intake and interview answers are lost on navigate-away. Someone filling a 60-second
morning who takes a phone call loses the night.

- Persist per-step, keyed by `morningDate`.
- Restore on return, with a visible "picking up where you left off".
- Clear on file, or on explicit discard.
- Drafts are local only. They never enter the clinical record or a study pack.

## 4. Intake battery

At enrollment, once: **STOP-BANG** (apnea risk) and **PROMIS Sleep Disturbance 4a/6a**
plus **PROMIS Sleep-Related Impairment** (severity, daytime half). Weekly: PROMIS SD only,
same weekday, ~90s, skippable.

All free to use. ISI and Epworth stay out — both copyrighted, both a licensing tail you do
not need for a shakedown.

This is what makes the export legible as an intake instrument rather than a wellness app,
and it is the difference between "14 nights of geometry" and "a severity trajectory".

## 5. Completion instrumentation

The number this phase exists to produce. Measured, not estimated:

| Metric | Why |
|---|---|
| Median interview completion time | Spec target is ≤60s. Measure it. |
| Per-step drop-off | Which question loses people |
| Nights filed / nights elapsed, per tester | The headline |
| Back-fill rate | How much of completion depends on §2 |
| All of the above, **segmented by cohort** | See above |

Surfaced in Operator, never to the tester. No streaks, no nudging on the number — the
notifications module already forbids that and it stays forbidden.

## 6. The export

**This is the sales artifact, not a pilot artifact.** When you walk into a clinic, the PDF
*is* the pitch. A clinician's first reaction to a 14-night grid is aesthetic before it is
clinical: does this look like something a professional made.

- Standard 14-night grid, TIB / TST / SE per night, weekly means and SD
- Sleep midpoint and variability
- Severity trajectory from PROMIS
- Medications and supplements as recorded
- Back-filled nights visibly marked
- Any triage flags raised
- Browser print stylesheet → PDF. No server, nothing leaves the device.

Worth more design attention than anything else in this spec. Budget accordingly.

## 7. Consent and safety

Two decisions, and the second is firm rather than open.

**Consent.** A stranger is handing you health data. Before the first night they see, in
plain language: what is collected, where it lives (on their device, encrypted), what you
receive, that they can stop and withdraw, and that this is not medical care and not a
diagnosis. One screen, no dark patterns, a real decline path.

▶ **What happens to their data when the shakedown ends?** Deleted, retained with consent,
or exported to them. Decide before anyone enrolls; it belongs in the consent copy.

**Safety routing — do not build a notify-James path for crisis disclosures.**

`safety-triage.ts` catches crisis, drowsy driving, witnessed apnea, mania, days without
sleep, and alcohol dependence. With no clinician attached, the temptation is to route
those to you. Don't.

You cannot be an on-call crisis service. A disclosure at 2am that reaches you at 9am is
worse than one that reached nobody, because the app will have implied someone was
listening. The triage already names what it heard and points at a human, and the ambient
crisis line is always-on and un-gated. That is the correct behaviour and it does not
change for this phase.

The non-urgent flags are different. **Witnessed apnea and drowsy driving should raise a
flag in Operator** — not for you to act on clinically, but because a tester describing
witnessed pauses in breathing should be told, once, clearly, that this is worth a doctor's
appointment. That is a referral, not a response.

## 8. Migration

1. Every new field is optional. Existing users see no change.
2. `coerceEpisode` gains `cohort` and the nullable `clinicianId`; rejects an unknown
   cohort rather than defaulting one.
3. `filedLate` absent means false — every existing night was filed on time.
4. Drafts are a separate store key, never merged into `reports`.
5. Intake scores are their own collection; they do not join `MorningReport`.
6. **Nothing new reaches a study pack** without an explicit allowlist entry and a test.

## 9. Invariants to pin

Each becomes a test and a row in `scripts/mutations.json`. The harness exists now; use it.

1. A `TreatmentWindow` cannot be created with a null `clinicianId`.
2. An episode with `clinicianId: null` never reaches `treatment`.
3. A back-filled report always carries `filedLate: true`.
4. No back-fill is ever generated without an explicit user action.
5. Drafts never appear in `reports`, the clinical record, or a study pack.
6. No free-text field reaches the export.
7. Crisis triage never produces a notification, a flag, or any outbound signal.

Invariant 7 is the one that matters most and is easiest to erode later.

## 10. Anti-goals

Carried forward, plus:

- **No proprietary sleep score.** Unchanged.
- **No automated window titration**, and no window at all in this phase.
- **No streaks, guilt, or win-backs** in any completion-driving feature.
- **No crisis escalation to James.** See §7.
- **No estimated data.** A missing night is missing.

## 11. Blockers that are not code

1. **▶ The Consensus Sleep Diary licence. This is now urgent.** You are about to collect
   real sleep data from real people using an instrument whose site says permission is
   required for industry or for-profit use. Every night collected before you ask is
   collected under an open question. Email Carney this week.
2. Consent copy, written before anyone enrolls.
3. ▶ Data disposition at the end of the shakedown.
4. IRB, if lab recruits are in scope.

## 12. Build order

1. **Back-fill + draft persistence** — protects every night you collect. Do this first.
2. **Solo enrollment** — nullable clinician, cohort, invite codes, the two new invariants.
3. **Intake battery** — STOP-BANG, PROMIS SD, PROMIS SRI.
4. **Completion instrumentation** — the number the phase produces.
5. **The export** — designed, then built.
6. **Consent copy + Operator referral flags.**

Each stage ships independently and leaves the app working. Each goes through the mutation
harness and the gate before it merges.
