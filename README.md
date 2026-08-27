# Circadia

A desktop sleep companion for people who **cannot fall asleep, cannot stay asleep, or both**. The job is a healthy, repeatable schedule — not a shop of powders.

Circadia is local-first. Profile, mornings, dreams, and chat live in this browser. There is no account. There is no cloud model. The advisor is a sleep-science engine that reads your bubbles and refuses to guess past the evidence.

**This is a computer app first.** Open it in a browser, bookmark it, dish the URL to testers. A phone wrap (Capacitor / store) is later packaging. Do not wait on a native shell to iterate.

## What you do

1. **You** — age, height, weight, activity, medications, supplements, target sleep/wake, study opt-in.
2. **Tonight** — countdown to screens-down (one hour before sleep), then a breathing field or calm noise.
3. **Morning interview** — tap bubbles. Yes/no. Dropdowns only when the answer is yes (drinks → how many / spins; supplements → which; night waking → about how long). Optional dream report, including “any meaning behind this?”
4. **Notes** — Circadia writes on the breakdown. After **seven** logged mornings it may discuss melatonin or magnesium. It will say when the first lever is alcohol or screens instead.
5. **Library** — conservative research you can actually stand behind. Import/export your data.

Ask Circadia in the consult rail. It only answers from your logs, your profile, and the library.

## Paid testers and anonymous nights

If you are paying people to use Circadia, payment happens **outside** the app. Circadia never asks who they are or how they get paid.

After intake they choose:

- **Join the study** — a random participant number is minted on this computer. After each real morning (not a loaded sample week), a stripped pack is POSTed to `/api/study`.
- **Keep everything on this computer** — the app is unchanged. Nothing is sent.

They can read the exact JSON in **You** before or after it leaves, download it, send now, or leave.

**What the pack contains:** age band, BMI band (or `unconfirmed` if body was never edited), struggle, activity, medication *classes* (stimulant, antihistamine, …), clocks, ratings, drink flags, session counts, chat *topic ids* and turn count.

**What never leaves:** name, dream text, chat text, medication/supplement strings, height/weight, calendar dates, report ids, IP.

Packs land in `data/study-inbox/` (gitignored). Optionally set `STUDY_INGEST_URL` (and `STUDY_INGEST_TOKEN`) on the server to forward a copy. The inbox is the local fallback if ingest is down.

Erase this device mints a new participant number. Pause and rejoin keeps the same number so nights still stitch.

## Run it

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:43147`.

```bash
npm test
npx tsc --noEmit
npm run build
```

`npm test` includes a generated consult corpus — thousands of paraphrases plus follow-ups (`what about the gels?` after Unisom). It checks routing and safety, not frozen essays. The library in `src/lib/research.ts` is the source of truth. Study tests prove a diary with a name, Adderall, a dream essay, and a Unisom chat cannot leak those strings into a pack.

## What this is not

Not medical care. Not a diagnosis. Not a prescription. If you snore and gasp, fall asleep while driving, or cannot stay awake, that is a clinic.

Melatonin is treated as a **clock signal**, not a sleeping pill. Magnesium is treated as **modest, mixed evidence**. CBT-I behaviors (fixed wake time, stimulus control, the hour off screens) outrank both.

Dream “meaning” is theme-tagging plus physiology (alcohol and REM rebound, medications). Circadia will not run a dream dictionary.

## Why this way

A remote model would be more fluent and less honest. Sleep data is intimate; the diary stays on-device unless someone joins the study, and even then the pack is inspectable and stripped. Fluent telemetry without consent is the opposite of this product. Electron / Capacitor are later packaging. See `docs/BLUEPRINT.md`.
