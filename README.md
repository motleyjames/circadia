# Circadia

A desktop sleep companion for people who **cannot fall asleep, cannot stay asleep, or both**. The job is a healthy, repeatable schedule — not a shop of powders.

Circadia is local-first. Profile, mornings, dreams, and chat live on this computer. There is no account. There is no cloud model. The advisor is a sleep-science engine that reads your bubbles and refuses to guess past the evidence.

## Put it on the Dock (Mac)

`npm run app` is a **session**. Closing the window used to quit that session, so the leftover Dock icon had nothing to reopen. That is fixed in two layers:

1. The red traffic-light **hides** Circadia. Click the Dock icon to bring it back. **Cmd+Q** is a real quit.
2. Install a real app you can reopen after quit:

```bash
cd rest-ai
git pull
npm install
npm run dock
```

That writes `~/Applications/Circadia.app` and opens it. Drag **that** icon to the Dock. Remove any old generic Electron icon first (right-click → Options → Remove from Dock).

First launch: if macOS says the app is from an unidentified developer, right-click Circadia → **Open**.

Do not Keep-in-Dock the window that came from `npm run app`. That icon is Electron, not Circadia.

Testers you pay: dish `~/Applications/Circadia.app` after `npm run dock`. Study packs stay on **their** Mac unless you set `STUDY_INGEST_URL` to a host you control, or they Download JSON in You and send you the file.

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

Packs land in `data/study-inbox/` in the repo, or `~/Library/Application Support/Circadia/study-inbox` in the packaged app. Optionally set `STUDY_INGEST_URL` (and `STUDY_INGEST_TOKEN`) so the server forwards a copy to you. The inbox is the local fallback if ingest is down.

Erase this device mints a new participant number. Pause and rejoin keeps the same number so nights still stitch.

## Browser only

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:43147`. This is still not a Finder app.

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

A remote model would be more fluent and less honest. Sleep data is intimate; the diary stays on-device unless someone joins the study, and even then the pack is inspectable and stripped. The Mac wrap is a window around that same local app — not a rewrite, not a store listing. See `docs/BLUEPRINT.md`.
