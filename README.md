# Circadia

A desktop sleep companion for people who **cannot fall asleep, cannot stay asleep, or both**. The job is a healthy, repeatable schedule — not a shop of powders.

Circadia is local-first. Profile, mornings, dreams, and chat live on this computer. Sign up with your name, an email or phone, and a password — that is how you log back in on this laptop, not a cloud account and not a way for James to reach you. The password is hashed on this computer. The advisor is a sleep-science engine that reads your bubbles and refuses to guess past the evidence.

## Put it on the Dock (Mac)

Two native apps. Same Swift binary. Different `install.json`. Not Electron.

- **Circadia** — ice clock, port 43148. Sign up / Log in, then the diary.
- **Circadia Operator** — gold clock, port 43149. Your inbox. Testers never see this.

`npm run dock` compiles Next for both surfaces, compiles `launcher.swift` once, then wraps two `.app` bundles. It will not copy `Electron.app`. If `swiftc` fails, nothing is replaced.

```bash
xcode-select --install   # once
npm install
npm run dock
```

That writes `Circadia.app` and `Circadia Operator.app` ( `/Applications` if writable, otherwise `~/Applications` ), then opens both. Drag both to the Dock. Remove any tile named Electron.

Operator-only: `npm run dock:mod`. Diary-only: `npm run dock:diary`. Browser inbox: `npm run mod` → http://127.0.0.1:43149, passphrase `circadia-local`.

Keep this folder where it is. If you move it, run `npm run dock` again. Unidentified developer: right-click → **Open**. Logs: `~/Library/Logs/Circadia.log` and `~/Library/Logs/Circadia-Operator.log`.

## What you do

1. **Sign up / Log in** — first and last name, email or phone, and a password. Circadia will not email or text you. There is no reset email: if you forget the password, the diary on this computer stays locked.
2. **Sleep intake** — age, height, weight, the problem, wake time, meds, alerts.
3. **Study gate** — yes turns the pipeline on. No Send button after that.
4. **Tonight** — countdown to screens-down (one hour before sleep), then a breathing field or calm noise.
5. **Morning interview** — tap bubbles. Yes/no. Dropdowns only when the answer is yes.
6. **Notes** — Circadia writes on the breakdown. After **seven** logged mornings it may discuss melatonin or magnesium.
7. **You** — the file. Clocks, meds, log out. Not a JSON dump. Not a second copy of chat.
8. **Library** — conservative research. Import/export your data.

## Paid testers and the pipeline

If you are paying people to use Circadia, payment happens **outside** the app.

After signup they choose once:

- **Join the study** — that is the send. A roster card leaves immediately (name, age, height, weight, clocks — not email or phone). After each real morning, a stripped night pack leaves on its own. If the app throws, a fault leaves too.
- **Keep everything on this computer** — the app is unchanged. Nothing is sent.

There is no Send now. Testers do not see JSON.

**Night packs contain:** age band, BMI band (or `unconfirmed` if body was never edited), struggle, activity, medication *classes*, clocks, ratings, drink flags, session counts, chat *topic ids* and turn count.

**Night packs never contain:** name, email, phone, dream text, chat text, medication/supplement strings, height/weight, calendar dates, report ids, IP.

**Roster cards contain** the name and body so testers show up in the inbox. Email and phone stay on their computer as the login identifier. That is not a cloud backup of the diary, and it is not a number James can call. Dreams still live only on their machine.

Packs land in `data/study-inbox/` on the machine running Circadia. Testers on *their* computers only reach you if that app can POST to a host you control — set `STUDY_INGEST_URL` (and optional `STUDY_INGEST_TOKEN`) on their install, pointing at yours.

Erase this device mints a new participant number. Pause and rejoin keeps the same number so nights still stitch.

## Operator (James only)

A second app. Gold clock, not the ice one. Not a page inside Circadia. `npm run dock` installs both apps from one Swift compile. Operator-only:

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

A remote model would be more fluent and less honest. Sleep data is intimate; the diary stays on-device unless someone joins the study. Join is the only send. Night packs stay stripped; the roster is a name and body, not a contact list. James reads packs in the operator app (`npm run mod`). The Mac wrap is a native window around that same local app — not a rewrite, not a store listing. See `docs/BLUEPRINT.md`.
