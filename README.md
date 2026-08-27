# Circadia

A phone-first sleep companion for people who **cannot fall asleep, cannot stay asleep, or both**. The job is a healthy, repeatable schedule — not a shop of powders.

Circadia is local-first. Profile, mornings, dreams, and chat live in this browser. There is no account. There is no cloud model. The advisor is a sleep-science engine that reads your bubbles and refuses to guess past the evidence.

**This is already the phone app.** Add to Home Screen (Safari or Chrome → Share → Add to Home Screen). Full screen, same data. A native store wrap does not fix a cheap first ten seconds — the opening is the product, and that is what this repo ships.

## What you do

1. **You** — age, height, weight, activity, medications, supplements, target sleep/wake.
2. **Tonight** — countdown to screens-down (one hour before sleep), then a breathing field or calm noise.
3. **Morning interview** — tap bubbles. Yes/no. Dropdowns only when the answer is yes (drinks → how many / spins; supplements → which; night waking → about how long). Optional dream report, including “any meaning behind this?”
4. **Notes** — Circadia writes on the breakdown. After **seven** logged mornings it may discuss melatonin or magnesium. It will say when the first lever is alcohol or screens instead.
5. **Library** — conservative research you can actually stand behind. Import/export your data.

Ask Circadia in the bar at the bottom. It only answers from your logs, your profile, and the library.

## Run it

```bash
npm install
npm run dev -- --port 43147 --hostname 127.0.0.1
```

Open `http://127.0.0.1:43147`. On a phone, add to home screen for the standalone shell.

```bash
npm test
npx tsc --noEmit
npm run build
```

## What this is not

Not medical care. Not a diagnosis. Not a prescription. If you snore and gasp, fall asleep while driving, or cannot stay awake, that is a clinic.

Melatonin is treated as a **clock signal**, not a sleeping pill. Magnesium is treated as **modest, mixed evidence**. CBT-I behaviors (fixed wake time, stimulus control, the hour off screens) outrank both.

Dream “meaning” is theme-tagging plus physiology (alcohol and REM rebound, medications). Circadia will not run a dream dictionary.

## Why this way

A remote model would be more fluent and less honest. Sleep data is intimate; the first slice keeps it on-device and makes every note point at a library article or a number you typed. Capacitor / App Store is later packaging (push that survives a killed tab). It is not what makes this feel like software. See `docs/BLUEPRINT.md`.
