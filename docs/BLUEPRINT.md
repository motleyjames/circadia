# Circadia blueprint

Elite product constraint: **help someone who cannot fall asleep or stay asleep get onto a schedule they can defend**, without lying about supplements, dreams, or what an app is allowed to know.

This document is the architecture. The running slice in this repo is the first vertical of it.

---

## 1. Who it is for

Not “everyone who wants to optimize.” The user already failed at sleep. They do not need another tracker that congratulates 6,000 steps. They need:

- a **short morning interview** they will actually finish (bubbles, not essays)
- an **evening gate** (screens down 60 minutes before the sleep window)
- notes that name the real lever (alcohol, drifting wake time, lying in bed awake) before they name a bottle
- optional dream storage without mysticism
- a chat that can be cross-examined: every claim should point at a log field or a library article

James-shaped context that must not become the whole product: college-aged, delayed clock, drinks, screens, maybe stimulants. The engine is parameterized by age, meds, BMI, activity — so a 45-year-old with magnesium already in the cabinet gets a different note.

---

## 2. Sleep science that is allowed to drive the product

Ranked. If a feature fights this list, the feature loses.

1. **Fixed wake time** is the circadian anchor (SCN, morning light). Weekend sleep-ins are social jet lag.
2. **Sleep pressure vs time in bed.** Stimulus control: bed is for sleep. Long latency is not a melatonin deficiency by default.
3. **CBT-I is first-line chronic insomnia care** (AASM). An app can coach the behaviors. It cannot run full sleep restriction without safety rails (bipolar spectrum, driving, untreated apnea).
4. **Alcohol fragments the second half of the night and suppresses REM.** Spins are a dose signal. This outranks supplements.
5. **The hour off screens is a behavioral gate.** Melanopsin / evening light is real; arousal from content is usually the larger term. Morning outdoor light is the other half.
6. **Duration bands** (NSF / AASM): teens 8–10, young adults 7–9, adults ≥7. Long time in bed with poor ratings ≠ more sleep.
7. **Melatonin** is a phase-shift signal. Typical circadian-science discussion: ~0.3–1 mg, *before* desired sleep, not 10 mg at lights-out. Not first-line insomnia. Hold recommendations until ~7 nights so we can see delay vs. alcohol vs. screens.
8. **Magnesium** (glycinate 200–400 mg is what people mean): mixed, small trials. Optional adjunct. Kidney disease is a hard stop we cannot see — say so.
9. **OSA** is not insomnia. High BMI + unrefreshing sleep → mention screening. Do not treat with noise machines.
10. **Dreams** are mostly REM cognition. Alcohol rebound and some antidepressants explain a lot of “wild night” reports. No symbol dictionary. Nightmare rehearsal therapy is a real tool and is out of scope for v1 copy except as a pointer.

Walker-style overclaim is banned. If the literature is mixed, the UI says **low confidence**.

Medical non-negotiable: Circadia never tells someone to stop a prescribed drug.

---

## 3. Product loops

```
evening:  countdown → screens-down ping → wind-down (breathing field / noise)
night:    (user is offline on purpose)
morning:  bubble interview → optional dream
anytime:  chat bar grounded in logs + library
week 1:   behavioral notes only
week 2+:  supplement discussion unlocked, still second to behavior
```

### Morning interview (must stay under a minute)

| Bubble | If yes |
| --- | --- |
| Wake time | — |
| Fell-asleep time (not lights-out) | — |
| Rating 1–5 | — |
| Drink last night? | How many, spins? |
| Screens-off duration | — |
| Lie-awake duration | — |
| Wake in the night and struggle? | About how long |
| Melatonin or magnesium? | Which |
| Did wind-down help? | Yes / a bit / no / didn’t use |
| Dream? (optional) | Text + “any meaning?” |

No paragraph fields except the dream.

### Profile the advisor is allowed to read

Age, sex (optional), height, weight, activity (sedentary→high), medications, supplements already in use, struggle (falling / staying / both), target window, notification opt-in.

---

## 4. Software architecture

**Shape:** a Next.js web app that *is* the phone app. Installable (PWA / Add to Home Screen). Desktop is a phone-width night shell so the product does not grow a dashboard personality.

**Later packaging, not a rewrite:** Capacitor (or a React Native wrap) for real push notifications and App Store chrome. Same TypeScript engine. Do not start over in Swift.

**State:** `localStorage` key `circadia:v1`. Export/import JSON. No auth in v1. Sleep diaries are intimate; a backend is a liability until there is a reason.

**Advisor:** deterministic functions in `src/lib/advisor.ts`, `recommendations.ts`, `chat.ts`, `dreams.ts`. This is the product. Tests in `*.test.ts` are the contract. A remote LLM may *narrate* these notes later; it must not *invent* the recommendation. Schema-validate if a model is ever added. Drop ungrounded claims.

**Audio:** Web Audio procedural noise (brown / pink / rain / ocean). No MP3 licensing. Meditations are a visual breathing field + optional `speechSynthesis`. Morning interview closes the loop (“did it help?”).

**Notifications:** Notification API + in-app countdown. Honest about the limit: browsers ping unreliably in the background. Native push is the Capacitor milestone.

```
src/lib/          engine (pure, tested)
src/context/      CircadiaProvider, persistence
src/components/   phone shell, bubbles, interview, wind-down
src/app/          routes: /  /check-in  /insights  /library  /you
```

---

## 5. What this slice ships vs what waits

**Shipped**

- Opening: brand cover → clinical intake (problem, age, wake, meds, one ping) → first Tonight as a countdown, not a dashboard
- Profile refinements (body, activity, window) live in You
- Tonight countdown + wind-down (3 meditations, 4 soundscapes)
- Morning bubble interview including dream option
- Grounded notes + 7-night supplement gate
- Chat bar
- Research library + JSON import/export
- Sample week (labeled) so the gate can be seen without waiting

**Next, still this repo**

- Apple Health / CSV import if we can keep it local
- Quiet hours widget / Capacitor push
- Optional hosted model behind an explicit key, grounded on the same notes object
- Clinical red-flag routing copy (Epworth, STOP-BANG) as *questions*, not scores that pretend to diagnose

**Not on the roadmap**

- Selling melatonin
- Dream dictionaries
- Exploit-y “hacks”
- Dark-pattern streaks that punish a missed morning

---

## 6. Trust design

- Every note has `confidence` and `sourceIds`.
- Supplement pack is `ready: false` until 7 nights.
- If alcohol or screens dominate, `id: "none"` — the honest recommendation is *not* a bottle.
- Chat disclaimer is attached to medical-adjacent answers.
- Sample data cannot silently become “your” data without the user tapping it.

That is the same instinct as a scanner that withholds on ungrounded model output: **safe failure beats confident theater.**
