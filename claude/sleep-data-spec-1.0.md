# Circadia sleep data — instrument spec v1.0 (design, not yet built)

Status: **for review.** No code written. Decisions James needs to make are marked ▶.

## The diagnosis

The diary asks ten reasonable-sounding homegrown questions. The field already standardised this — the **Consensus Sleep Diary** (Carney et al., *Sleep* 2012;35(2):287-302) was built by a panel of insomnia researchers and clinicians specifically to stop everyone inventing their own. Adopting it is a **swap, not an expansion**: nine core items against the ten already asked.

The concrete cost of not having it:

| Missing | Consequence |
|---|---|
| Time into bed, time out of bed | **Sleep efficiency is uncomputable.** 10 h in bed / 6 h asleep (60%, textbook insomnia) and 6.5 h in bed / 6 h asleep (92%, fine) are *identical* in the current data. SE is the metric sleep restriction titrates on, and BLUEPRINT calls restriction first-line. |
| Awakening **count** (only a boolean today) | Cannot separate fragmentation from WASO. One 90-min waking ≠ five 18-min wakings. |
| Naps | Sleep pressure is uninterpretable. Cannot responsibly discuss time in bed without them. |
| Caffeine | The library has a whole note on it; the diary never asks. Same for nicotine and exercise timing. |
| `fellAsleepAt` as a **clock time** | Nobody knows this. The CSD deliberately asks a *duration* and instructs people **not to watch the clock** — clock-watching is a perpetuating factor `sleep-pressure` already warns about. It is also redundant with `sleepLatencyMinutes` and can contradict it. |

## Item set

Ask in the order the night happened — recall is much better that way.

| # | Item | Type | Conditional |
|---|---|---|---|
| 1 | What time did you get into bed? | clock, 15-min | prefill last night |
| 2 | What time did you try to sleep? | clock, 15-min | prefill; "same as into bed" chip |
| 3 | How long to fall asleep? | bucket (existing) | |
| 4 | Wake during the night? | bool | |
| 5 | How many times? | 1 / 2 / 3 / 4+ | only if 4 |
| 6 | Total time awake? | bucket (existing) | only if 4 |
| 7 | Final awakening time | clock, 15-min | |
| 8 | Out of bed for the day | clock, 15-min | prefill; "straight away" chip |
| 9 | Sleep quality | 5-point (existing) | |
| 10 | Nap yesterday? → how long | bool → bucket | duration only if yes |
| 11 | Alcohol → count, spins | existing | |
| 12 | Caffeine after 2pm? | bool, or "last caffeine" bucket | ▶ decide |
| 13 | Meds / supplements | existing | |
| 14 | Wind-down help | existing | |
| 15 | Dream | existing, optional | |

Median completion target **≤60 s** — measure it, don't assume. Most items are one tap; four are conditional; three are prefilled from last night, which is the single biggest time saver since bedtime rarely moves.

**Drop `fellAsleepAt` as an asked question.** Derive it: `sleepOnset = triedToSleepAt + SOL`. Removes an unanswerable question and the redundancy in one move.

## Derived metrics

Canonical CSD scoring:

```
TIB  = outOfBedAt − inBedAt
EMA  = outOfBedAt − finalAwakeningAt          (terminal wakefulness)
TST  = (finalAwakeningAt − triedToSleepAt) − SOL − WASO
SE%  = TST / TIB × 100
TWT  = SOL + WASO + EMA
```

Note TIB runs into-bed → out-of-bed, not lights-out → out-of-bed. That is the CSD manual's definition and the conservative (larger) denominator — and it is the one that matters for stimulus control, since time lying awake in bed is exactly the thing being measured.

Report SE. **Do not titrate a restriction window** — that stays with a clinician, per BLUEPRINT, and the `sleep-restriction` note already says so. Showing the trend is the value.

Weekly: mean and **SD** of TST, sleep midpoint, and SE. Variability is as clinically interesting as the mean, and SD is defensible from diary data.

▶ **Sleep Regularity Index** (Phillips et al., *Sci Rep* 2017) is the modern regularity metric, but it wants minute-level sleep/wake and would be diary-*approximated* here (WASO has no timestamps). Worth it, or stick to SD of midpoint?

## Severity instrument — and a licensing problem

A daily 1-5 quality rating is not a severity measure. The weekly instrument turns "rated 3.2/5" into a number a clinician recognises.

- **ISI** (Insomnia Severity Index) — 7 items, the instrument clinicians know. Bands 0-7 none / 8-14 subthreshold / 15-21 moderate / 22-28 severe; ~6 points is generally cited as meaningful change. **It is copyrighted (© Morin) and commercial use normally requires a licence** (Mapi / ePROVIDE). I am not giving legal advice — this needs checking before it ships, and it is the kind of thing that is much cheaper to check now than after launch.
- **PROMIS Sleep Disturbance 4a / 6a** — NIH-funded, **free and public domain**, validated, T-scored against a US general population. Less famous to a clinician, no licensing question, and the T-score is arguably better than a raw band. Pair with PROMIS Sleep-Related Impairment for the daytime half.
- **Epworth** is also copyrighted; same caution.

▶ **My recommendation: PROMIS as the shipping default**, with ISI as a later option if you license it. Free, validated, no legal tail.

Cadence: weekly, not daily. Same weekday, ~90 s, skippable.

## Migration — the part that can break real data

You have logged nights. Plan:

1. All new fields are **optional** on `MorningReport`. Nothing existing is removed in this version.
2. `coerceReport` fills them `undefined` for old rows; `hydrateState` unchanged in shape.
3. **Metrics must be partial-aware.** `sleepEfficiency(report)` returns `null` when TIB is unavailable. `WeekBreakdown` gains `nightsWithEfficiency` so the UI can say *"sleep efficiency starts once you have a few mornings on the new questions"* rather than render a wrong number.
4. **Never back-fill a guess.** An estimated TIB is worse than no TIB — it would silently corrupt the one metric this whole exercise exists to produce.
5. Old `fellAsleepAt` stays readable for historical nights; new nights derive it.
6. Study pack: new fields need adding to `TOP_KEYS`/allowlists and the anonymity scan. SE and a severity band carry no PII and are safe to send; nap and caffeine flags likewise.

## The payoff: a clinician-ready export

A two-week sleep diary is *literally what a sleep clinic asks you to bring to a first appointment*. Once the item set above exists, Circadia can print it: the standard 14-night grid, TIB/TST/SE per night with weekly means, the severity trajectory, medications, and any red flags the triage caught.

Browser print stylesheet → PDF. No server, nothing leaves the device. This is what makes "that is a clinic, not a chat bar" actionable instead of a dead end, and no consumer sleep app does it decently.

## Anti-goals

- **No proprietary sleep score.** The `sleep-trackers` note warns about orthosomnia; inventing a 0-100 number would contradict it.
- No estimating TST when items are missing.
- No new free-text fields.
- Don't ask for a clock time nobody can know.

## Build order

1. Types + migration + partial-aware metrics (no UI) — the foundation, fully testable in isolation.
2. Interview: conditional steps, prefill, timing measurement.
3. Notes/insights surfacing SE and variability.
4. Weekly severity instrument.
5. Clinician export.

Each stage ships independently and leaves the app working.
