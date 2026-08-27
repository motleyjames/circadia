# Circadia

A desktop sleep companion for people who **cannot fall asleep, cannot stay asleep, or both**. The job is a healthy, repeatable schedule — not a shop of powders.

Circadia is local-first. Profile, mornings, dreams, and chat live on this computer. There is no account. There is no cloud model. The advisor is a sleep-science engine that reads your bubbles and refuses to guess past the evidence.

## Put it on the Dock (Mac)

Circadia is a native WKWebView window, not Electron. Electron fallback is what produced `Cannot find module …/app/Users/…/electron/main.cjs`.

If that dialog is on screen **right now**, do not run `npm run dock`. That command, on an old rest-ai tree, rebuilds Operator, dies on `/check-in`, and leaves the broken Electron app in place.

```bash
cd ~/rest-ai
# Cmd+Q the error dialog first
node electron/fix-mac.cjs
```

If `electron/fix-mac.cjs` is not in that folder, this session’s commits are not on that clone. Paste the fixer from the agent thread, or copy `electron/fix-mac.cjs` in by hand. Then:

```bash
npm run dev
```

Diary: http://127.0.0.1:43147. Operator inbox (James): `npm run mod` → http://127.0.0.1:43149. Passphrase `circadia-local`.

Native Dock, once Command Line Tools are installed (`xcode-select --install`):

```bash
npm run dock
```

That installs **Circadia only**. Operator Dock is separate: `npm run dock:mod`. `npm run dock` used to chain both; the Operator compile aborting is why ice Circadia never got replaced.

Keep the `rest-ai` folder where it is. If you move it, run `npm run dock` again. If macOS says unidentified developer: right-click Circadia → **Open**. Logs: `~/Library/Logs/Circadia.log`.

## What you do

1. **Signup** — name, age, height, weight, and an email or phone so the file can be found if this computer is wiped.
2. **Study gate** — yes turns the pipeline on. No Send button after that.
3. **Tonight** — countdown to screens-down (one hour before sleep), then a breathing field or calm noise.
4. **Morning interview** — tap bubbles. Yes/no. Dropdowns only when the answer is yes.
5. **Notes** — Circadia writes on the breakdown. After **seven** logged mornings it may discuss melatonin or magnesium.
6. **You** — the file. Clocks, meds, contact. Not a JSON dump. Not a second copy of chat.
7. **Library** — conservative research. Import/export your data.

## Paid testers and the pipeline

If you are paying people to use Circadia, payment happens **outside** the app.

After signup they choose once:

- **Join the study** — that is the send. A roster card leaves immediately (name, email or phone, age, height, weight, clocks). After each real morning, a stripped night pack leaves on its own. If the app throws, a fault leaves too.
- **Keep everything on this computer** — the app is unchanged. Nothing is sent.

There is no Send now. Testers do not see JSON.

**Night packs contain:** age band, BMI band (or `unconfirmed` if body was never edited), struggle, activity, medication *classes*, clocks, ratings, drink flags, session counts, chat *topic ids* and turn count.

**Night packs never contain:** name, email, phone, dream text, chat text, medication/supplement strings, height/weight, calendar dates, report ids, IP.

**Roster cards contain** the contact so a wiped laptop is not a lost tester. That is not a cloud backup of the diary. Dreams still live only on their machine.

Packs land in `data/study-inbox/` on the machine running Circadia. Testers on *their* computers only reach you if that app can POST to a host you control — set `STUDY_INGEST_URL` (and optional `STUDY_INGEST_TOKEN`) on their install, pointing at yours.

Erase this device mints a new participant number. Pause and rejoin keeps the same number so nights still stitch.

## Operator (James only)

A second app. Gold clock, not the ice one. Not a page inside Circadia.

```bash
npm run dock:mod
```

Drag **Circadia Operator** to the Dock. Passphrase `circadia-local` until you set `CIRCADIA_MOD_KEY`.

Browser-only (no Dock icon): `npm run mod` → `http://127.0.0.1:43149`.

The diary stays `Circadia.app` / `http://127.0.0.1:43147`. Testers cannot reach this inbox from there.

## Browser only

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

`npm test` includes a generated consult corpus — thousands of paraphrases plus follow-ups. It checks routing and safety, not frozen essays. The library in `src/lib/research.ts` is the source of truth.

## What this is not

Not medical care. Not a diagnosis. Not a prescription. If you snore and gasp, fall asleep while driving, or cannot stay awake, that is a clinic.

Melatonin is treated as a **clock signal**, not a sleeping pill. Magnesium is treated as **modest, mixed evidence**. CBT-I behaviors (fixed wake time, stimulus control, the hour off screens) outrank both.

Dream “meaning” is theme-tagging plus physiology (alcohol and REM rebound, medications). Circadia will not run a dream dictionary.

## Why this way

A remote model would be more fluent and less honest. Sleep data is intimate; the diary stays on-device unless someone joins the study. Join is the only send. Night packs stay stripped; contact lives on a separate roster James reads in the operator app (`npm run mod`). The Mac wrap is a native window around that same local app — not a rewrite, not a store listing. See `docs/BLUEPRINT.md`.
