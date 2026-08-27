# Circadia

A desktop sleep companion for people who **cannot fall asleep, cannot stay asleep, or both**. The job is a healthy, repeatable schedule — not a shop of powders.

Circadia is local-first. Profile, mornings, dreams, and chat live on this computer. There is no account. There is no cloud model. The advisor is a sleep-science engine that reads your bubbles and refuses to guess past the evidence.

## Put it on the Dock (Mac)

This is not a packaged Chromium app. Those kept dying on launch. `npm run dock` compiles a tiny native window and a **production** Circadia server on port 43148. It does not wrap `next dev` — that is what put the Next.js error overlay over Begin.

```bash
cd rest-ai
git pull
npm install
npm run dock
```

The compile takes a minute. Wait for a Circadia window. The sidebar should say **v0.5.0**. Morning should ask *Did you take any supplements last night to help you sleep?* — **no** red Next.js `N`. If you still see `N` or “Melatonin or magnesium last night?”, that window is the old process: Cmd+Q, then `npm run dock` again.

Keep the `rest-ai` folder where it is. If you move it, run `npm run dock` again. Chrome on http://127.0.0.1:43147 is still `npm run dev` for hacking; the Dock app is the product window.

Keep the `rest-ai` folder where it is. The app is a pointer to this project. If you move the folder, run `npm run dock` again.

If macOS says the app is from an unidentified developer: right-click Circadia → **Open**.

If the window never appears, send the last 40 lines of `~/Library/Logs/Circadia.log`. That file is the diagnosis.

Need Command Line Tools once (`xcode-select --install`) so `swiftc` can build the window. Without them, dock falls back to this Mac's Electron **without renaming its binary**.

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

A second app. Not a page inside the diary.

```bash
npm run mod
```

Then open `http://127.0.0.1:43149`. Passphrase `circadia-local` until you set `CIRCADIA_MOD_KEY`.

The diary stays at `http://127.0.0.1:43147`. Testers cannot reach this inbox from there.

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
