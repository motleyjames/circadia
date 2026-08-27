# Circadia blueprint

**Job:** get someone who cannot fall asleep, cannot stay asleep, or both, onto a schedule they can defend — without lying about bottles, dreams, or what an app is allowed to know.

This is the architecture. The running app is the first vertical, not a mock.

---

## 0. Voice split (non-negotiable)

The **engine** may say AASM, CBT-I, SCN, melanopsin. This document does. Tests and library sources do.

The **mouth** (onboarding, Tonight, chat replies, chips) may not. A 3 a.m. user gets “get up if you are still awake,” not an acronym. Jargon in the mouth is a product bug even when the science is right.

Same content. Two registers. If they drift, the mouth is wrong.

---

## 1. Who it is for

Not “everyone who wants to optimize.” They already failed at sleep. They need:

- an **opening that feels like software** on a computer — sidebar, consult rail, not a phone bezel in a browser
- a **short morning interview** they will actually finish (bubbles, not essays)
- an **evening gate** (screens down 60 minutes before the sleep window)
- notes that name the real lever (alcohol, drifting wake time, lying in bed awake) before they name a bottle
- a consult that **answers the question they typed**, including follow-ups, and withholds when it does not have a note
- optional dream storage without mysticism

James-shaped context that must not become the whole product: college-aged, delayed clock, drinks, screens, maybe stimulants. The engine is parameterized by age, meds, BMI, activity — so a 45-year-old with magnesium already in the cabinet gets a different note.

---

## 2. Sleep science that is allowed to drive the product

Ranked. If a feature fights this list, the feature loses.

1. **Fixed wake time** is the circadian anchor (SCN, morning light). Weekend sleep-ins are social jet lag. Asleep-by is **derived** from wake × age-band midpoint. Wake is the independent variable.
2. **Sleep pressure vs time in bed.** Bed is for sleep. If awake ~20 minutes, get up. Long latency is not a melatonin deficiency by default.
3. **CBT-I is first-line chronic insomnia care** (AASM). The app coaches the behaviors. It does not run full sleep restriction without safety rails (bipolar spectrum, driving, untreated apnea).
4. **Alcohol fragments the second half of the night and suppresses REM.** Spins are a dose signal. This outranks supplements.
5. **The hour off screens is a behavioral gate.** Melanopsin / evening light is real; arousal from content is usually the larger term. Morning outdoor light is the other half.
6. **Duration bands** (NSF / AASM): teens 8–10, young adults 7–9, adults ≥7. Long time in bed with poor ratings ≠ more sleep.
7. **Melatonin** is a phase-shift signal (~0.3–1 mg, *before* desired sleep), not a 10 mg hypnotic at lights-out. Hold recommendations until ~7 nights so delay vs alcohol vs screens can show.
8. **Aisle sedatives** (Unisom / doxylamine, Benadryl / diphenhydramine, ZzzQuil, PM combos) knock you out. They are not good sleep and not a nightly plan. Antihistamines are not first-line chronic insomnia care.
9. **Prescription hypnotics** (Ambien and kin): education only. Never start, stop, or change a dose from the app.
10. **Magnesium** (glycinate 200–400 mg is what people mean): mixed, small trials. Optional adjunct. Kidney disease is a hard stop we cannot see — say so.
11. **THC** sedates then steals REM. **Nicotine** is a stimulant you take to bed. **Caffeine** half-life ~5–6 h. Name them when asked; do not moralize.
12. **OSA** is not insomnia. Snore / gasp / high BMI + unrefreshing sleep → clinician, not a noise machine.
13. **Pregnancy:** no pharmacologic suggestions. Obstetric clinician.
14. **Dreams** are mostly REM cognition. Alcohol rebound and some antidepressants explain a lot of “wild night” reports. No symbol dictionary.

Walker-style overclaim is banned. If the literature is mixed, the UI says **low confidence**.

**Medical non-negotiable:** Circadia never tells someone to stop a prescribed drug.

---

## 3. Product loops

```
first open:  cover → intake → study gate (join or keep local) → Tonight
evening:     countdown disc → screens-down ping → wind-down
night:       (user is offline on purpose)
morning:     bubble interview → optional dream
anytime:     chat bar (follow-ups allowed) — the rail is the thread
week 1:      behavioral notes only
week 2+:     supplement discussion unlocked, still second to behavior
```

Open Circadia **always lands on Tonight** after the study gate, not whatever route was underneath the overlay.

### Intake (door)

Five screens. Wake is the anchor; asleep-by is computed. Height / weight / name live in **You** — a clinic does not start with ft/in/lb. Body numbers that were never confirmed must not drive OSA notes as if they were measured (defaults exist so the schema hydrates; You is where they become real).

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

No paragraph fields except the dream. Morning CTA on Tonight only in the morning window — not at 10 p.m. on night zero.

### Profile the advisor is allowed to read

Age, sex (optional), height, weight, activity, medications, supplements already in use, struggle (falling / staying / both), target window, notification opt-in.

---

## 4. Consult engine (chat)

Chat is not a model. It is a **deterministic consult**: question → topic → library note → plain-English answer. Unknown → withhold. That failure is the feature.

**Follow-ups.** A short second line (“what about the gels?”, “how much?”, “is that safe every night?”) folds onto the last user question unless the new line names a different topic (melatonin after Unisom **switches**). Do not stuff citation ids into the query string — `melatonin` as an id poisons the next match.

**Mouth invariants** (enforced in `src/lib/chat.corpus.test.ts`):

- no AASM / CBT-I / SCN in replies
- no empty-diary recap when they asked about a bottle
- never “stop taking” a prescribed drug
- Unisom path must mention the antihistamine, not the sleep window

The corpus is generated paraphrases + follow-ups (thousands per `npm test`). It asserts **routing and safety**, not frozen essays. When a real utterance withholds, add a library note and a stem. Do not rent a chatbot.

**Library** (`src/lib/research.ts`) is the answer key. Chat (`chat.ts`, `consult-extra.ts`) is the mouth. `chat-history.ts` is the follow-up fold. Matching uses word boundaries (`dating` must not hit `sedating`).

The consult rail is the thread. You is the file, not a second copy of the chat.

A remote LLM may *narrate* these notes later, behind an explicit key. It must not *invent* the recommendation. Schema-validate. Drop ungrounded claims. Safe failure beats fluent theater.

---

## 5. Software architecture

**Shape:** a Next.js desktop app, also packaged as an Electron Mac window (`npm run app`, `npm run dist` → `Circadia.app`). Full window, left sidebar, consult as a right rail (dock on narrower screens). Phone / Capacitor is later.

**State:** `localStorage` vault `circadia:v1:files` keyed by email or phone, plus `circadia:v1:session` for which file is open. Legacy `circadia:v1` migrates once. Export/import JSON. Schema-hydrate on the way in. Local login, no server account, no password.

**Study:** optional, consent-gated after sleep intake. Yes turns the pipeline on — no Send button. Three schemas hit `POST /api/study` on the diary. `circadia-roster-v1` (name + body; email/phone fields exist for old files but new cards send null), `circadia-study-v1` (stripped nights), `circadia-fault-v1` (app errors). James reads them in Circadia Operator.app (`npm run dock:mod`, gold clock) or `npm run mod` on port 43149, gated by `CIRCADIA_MOD_KEY`. The diary 404s `/mod`. Write to `data/study-inbox/` (gitignored). Optional forward via `STUDY_INGEST_URL`. Do not store request IP. Never auto-send a loaded sample week.

**Audio:** Web Audio procedural noise. Unlock on a **user gesture** or devices stay silent. No MP3 licensing. Meditations are a visual field + optional `speechSynthesis`.

**Notifications:** Notification API, permission only from a tap (intake / You). Honest limit: browsers ping unreliably in the background. The countdown is the reliable gate. Native push is the Capacitor milestone.

```
electron/         Mac window (main process, preload, icon)
src/lib/          engine (pure, tested) — advisor, chat, research, corpus, study
src/context/      CircadiaProvider, persistence, study send
src/components/   login, intake, study gate, Tonight, interview, wind-down, You
src/app/          diary: /  /check-in  /insights  /library  /you  /api/study
                  operator: npm run dock:mod → Circadia Operator.app  /  npm run mod → :43149
```

---

## 6. What this slice ships vs what waits

**Shipped**

- Cover → clinical intake → countdown-first Tonight
- Wake-derived window; body metrics editable in You
- Tonight countdown + wind-down (3 meditations, 4 soundscapes)
- Morning bubble interview including dream option
- Grounded notes + 7-night supplement gate
- Consult engine + follow-ups + You thread + corpus tests
- Research library (clock, alcohol, aisle, Rx, THC, nicotine, shift, jet lag, pregnancy, reflux, …)
- JSON import/export; sample week labeled, confirm-before-overwrite
- Desktop shell (sidebar + consult rail)
- Anonymous study packs, consent gate, inspectable JSON, local inbox
- Mac app window (`npm run app`) and `Circadia.app` package (`npm run dist` on a Mac)

**Next, still this repo**

- Apple Health / CSV import if we can keep it local
- Quiet hours / Capacitor push; phone wrap after the desktop loop is stable
- Confirm body metrics before BMI/OSA notes treat them as measured
- Optional hosted model behind an explicit key, grounded on the same notes object
- Clinical red-flag copy (Epworth, STOP-BANG) as *questions*, not scores that pretend to diagnose
- Apple Developer signing so testers skip Gatekeeper

**Not on the roadmap**

- Selling melatonin
- Dream dictionaries
- Working exploits or “try this stack”
- Dark-pattern streaks that punish a missed morning
- A chatbot that answers Unisom by guessing

---

## 7. Trust design

- Every note has `confidence` and `sourceIds`.
- Supplement pack is `ready: false` until 7 nights.
- If alcohol or screens dominate, `id: "none"` — the honest recommendation is *not* a bottle.
- Chat: answer the question first. Diary context is optional and only when it belongs. Unknown withholds.
- Sample data cannot silently become “your” data without the user tapping it.
- Scanned-in JSON is untrusted input: schema-check it.
- Study packs are untrusted input on the way in (schema + allowlist). Identity never keys a night. Payment never lives in the app.

That is the same instinct as a scanner that withholds on ungrounded model output: **safe failure beats confident theater.**
