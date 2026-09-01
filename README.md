# Circadia

A local-first sleep companion for people who **cannot fall asleep, cannot stay asleep, or both**. The job is a healthy, repeatable schedule — not a shop of powders.

One diary, two shells: **Circadia.app** on the Mac, and an iPhone wrap of the same diary (no Operator). Sign up with your name, an email or phone, and a password — that is how you log back in on this device, not a cloud account and not a way for James to reach you. The password is stretched with PBKDF2; the diary is encrypted with AES-GCM. After you log in, the AES key lives in the device Keychain (service `Circadia`), not next to the ciphertext. If Keychain is unavailable, Circadia stays locked after quit — it will not write that key to disk. Circadia never sends the password anywhere, and there is no reset email — if you forget it, the diary on this device stays locked. The advisor is a sleep-science engine that reads your bubbles and refuses to guess past the evidence.

## Put it on the Dock (Mac)

Two native apps. Same Swift binary. Different `install.json`. Not Electron.

- **Circadia** — ice clock, port 43148. Sign up / Log in, then the diary.
- **Circadia Operator** — gold clock, port 43149. Your inbox. Testers never see this.

Clone **this** tree (0.6.5+). Do not run Dock commands from an older rest-ai checkout — that copy is 0.5.0 and rebuilds the broken Electron app.

```bash
git clone https://github.com/motleyjames/circadia.git ~/circadia
cd ~/circadia
node -e "console.log(require('./package.json').name, require('./package.json').version)"
npm install
npm run put-on-dock
```

The `node` line must print `circadia 0.6.5` or newer. Stop if it does not.

`npm run dock` compiles Next for both surfaces, compiles `launcher.swift` once, then wraps two `.app` bundles. It will not copy `Electron.app`. If `swiftc` fails, nothing is replaced.

That writes `Circadia.app` and `Circadia Operator.app` ( `/Applications` if writable, otherwise `~/Applications` ), then opens both. Drag both to the Dock. Remove any tile named Electron.

Operator-only: `npm run dock:mod`. Diary-only: `npm run dock:diary`. Browser inbox: `npm run mod` → http://127.0.0.1:43149, passphrase `circadia-local`.

Keep this folder where it is. If you move it, run `npm run dock` once. After that, **opening Circadia.app or Circadia Operator.app pulls GitHub `main` and rebuilds**. Unidentified developer: right-click → **Open**. Logs: `~/Library/Logs/Circadia.log` and `~/Library/Logs/Circadia-Operator.log`.

## What you do

1. **Sign up / Log in** — first and last name, email or phone, and a password. Circadia will not email or text you. There is no company server holding passwords: unlock happens on this device, then the diary is encrypted at rest. The stay-signed-in key is in the Keychain, not beside `vault.json`. There is no reset email — if you forget it, the diary on this device stays locked. If a diary is already here, the gate opens on **Log in** and names the email or phone. On a Mac the file is `~/Library/Application Support/Circadia`. On iPhone it is the app sandbox (`vault.json` in Capacitor `Directory.Data`). After you log in, Circadia stays signed in on this device until you log out — quitting the app is not logout. If Keychain cannot store the session key, the next launch will ask for the password again rather than keep a plaintext key on disk.
2. **Sleep intake** — age, height, weight, the problem, wake time, which mornings you have to get up, meds, alerts.
3. **Study gate** — yes turns the pipeline on. No Send button after that.
4. **Tonight** — countdown to screens-down (one hour before sleep), then a guided meditation or calm noise. The guide is a quiet recording over a low tone. Close your eyes; you do not have to read the orb.
5. **Morning interview** — one page per calendar morning, after the wake time you set (with a short window before). Duration first, then the night. If this morning is already filed, you see that page — you can change an answer or withdraw it. Circadia will not stack a second night on the same date.
6. **Notes** — a week read from the first mornings: which dates were better, which were worse, and what I would try next. Honest when the window is thin. After each morning, one library page that night actually earned — not a tour of the shelf. Bottles stay in **Consult**, and only after about seven logs.
7. **You** — the file. Clocks, meds, log out. Not a JSON dump. Not a second copy of chat.
8. **Library** — conservative research. Plain language first, sources second. Each note is stamped with the month a person last checked it against current guidelines; `npm test` fails if a stamp is more than a year old. Circadia does not scrape PubMed (local-first). The morning’s page is pinned at the top; the rest of the shelf stays browseable. Not a JSON dump of the diary.
9. **Consult** — on a wide Mac window, the desk on the right. On a phone, the word **Ask** at the top right, which opens Consult as its own screen. Opens empty. Answers from the diary (a named morning, last night, this week) and the library. Citations open the note. Unknown → withhold. Past consults file to History, by day. Open one to continue. Delete if you want it gone.

## Paid testers and the pipeline

If you are paying people to use Circadia, payment happens **outside** the app.

After signup they choose once:

- **Join the study** — that is the send. A roster card leaves immediately (participant number, sleep window, falling/staying — not a name, not email or phone). After each real morning, a stripped night pack leaves on its own. If the app throws, a fault leaves too.
- **Keep everything on this device** — the app is unchanged. Nothing is sent.

There is no Send now. Testers do not see JSON.

**Night packs contain:** age band, BMI band (or `unconfirmed` if body was never edited), struggle, activity, medication *classes*, clocks, ratings, drink flags, session counts, chat *topic ids* and turn count.

**Night packs never contain:** name, email, phone, dream text, chat text, medication/supplement strings, height/weight, calendar dates, report ids, IP.

**Roster cards contain** a participant number, sleep window, and struggle flags so testers still show up as users in the inbox. Names, email, phone, height, and weight stay on their device. That is not a cloud backup of the diary, and it is not a number James can call. Dreams still live only on their machine.

The operator app shows signup counts and sleep stats against that participant number. It does not show names or other personal information.

Packs land in `data/study-inbox/` on the Mac running Circadia. Testers on *their* Macs only reach you if that app can POST to a host you control — set `STUDY_INGEST_URL` (and optional `STUDY_INGEST_TOKEN`) on their install, pointing at yours. The iPhone wrap has no `/api/study` route; if someone joins the study on the phone, packs stay on that phone until there is a hosted ingest. Do not bake a URL into the repo.

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

`npm test` includes a generated consult corpus — thousands of paraphrases plus follow-ups. It checks routing and safety, not frozen essays. The library in `src/lib/research.ts` is the source of truth. Every note there has a `reviewedThrough` month. If that month is more than 12 months behind today, the suite fails — that is how the shelf stays current without a network call. When a guideline moves, update the note and bump the stamp.

## iPhone (diary only)

Same diary. Not a second product. **Operator is never in this binary.** Tonight is the clock. **Ask** is a word, not a sixth tab. Five tabs: Tonight, Morning, Notes, Library, You. Layout is the only difference: phone is bottom tabs + Ask sheet, Dock is sidebar + rail. 0.8.12 folds nights both ways at USB: the phone absorbs the packed Mac diary into a diary that already has mornings, and Circadia.app folds a phone vault copied at `put-on-phone`. They are still not a live cloud pair. 0.8.11 holds a still mark under the native splash then dissolves, loads bedside WAVs even when Capacitor reports status 0, ticks the in-app clock from the phone clock, and treats a 200 that is not an inbox as held — not “Send failed (200)”. 0.8.10 plays the open after the native splash, loads the bedside guides as PCM without needing the mixer first, and keeps the study pipeline honest on a phone that has no inbox. 0.8.9 only installs when CoreDevice has a live tunnel — a paired-but-disconnected Wi-Fi row is not a target. 0.8.8 is the round clock: Tonight’s countdown is an SVG circle clipped to a circle, not a square glow box. 0.8.7 is the open and the sky: the mark draws on launch, Tonight is one atmosphere instead of three boxes, and a night filed on the phone folds into Circadia.app from a locked copy — they are not a live cloud pair. 0.8.6 keeps stay-signed-in by swapping those five views inside one JS lifetime. Do not set `ios.scrollEnabled: false`.

The iPhone starts empty unless the locked diary from the Circadia that installed it is packed into the build. Circadia is local-first: there is no cloud account. `npm run put-on-phone` **fails** if it cannot pack a diary, then compiles onto James-iPhone's hardware UDID even if the phone is idle, and **refuses to install** until CoreDevice says the tunnel is connected (USB or live Wi-Fi). A device list that says `unavailable` is an idle tunnel, not an install target — xctrace listing the UDID does not count as connected. After `BUILD SUCCEEDED` it waits up to ten minutes for that live tunnel, then tries native-run, then Apple’s installer with the hardware UDID only. Signing uses a leftover development profile for this phone if one exists; otherwise the Apple ID in Xcode Accounts (including Xcode 16 team keys). It does not pass a keychain-only team into automatic signing, and it does not use destination Any iOS Device. Log in with the same email or phone and password. The gate footer must read `0.8.12 · diary packed`.

**Move nights onto the phone**

Unlock James-iPhone and keep the screen on. Open Circadia.app so it can write the locked file. Then, with no comments on these lines:

```bash
cd ~/circadia
git pull
npm run put-on-phone
```

If it stops with “No locked diary”, log in on Circadia.app, wait, run it again. If install still cannot open a tunnel, stay plugged in and unlocked for that one run — the Next.js pack will not rebuild unless the diary or the commit changed. After the footer reads **0.8.12 · diary packed**, **Quit Circadia.app fully and reopen**, then reopen the phone so each side can fold the other’s nights. Unplug — the installed app does not talk to the Mac. **Log in** with the same password.

Or: Circadia → **You** → **Save a locked copy**. AirDrop `circadia-locked.circadia`. On the other Circadia, **Fold nights from a locked copy**. That keeps mornings already there. **Bring a locked diary** still replaces.

A morning filed on the phone lands on Circadia.app after `put-on-phone` plus a full quit-and-reopen of Circadia.app (USB copy of the phone vault, then fold). Between those steps they are two local copies. AirDrop fold still works. Local-first: there is no live pair.

Signing up on the phone starts a second diary. A leftover signup with no nights is replaced when the packed password is correct. A leftover diary that already has mornings keeps them and folds packed mornings in.

Apple is the remaining gate, not more app code. Two tracks, started in parallel:

1. **Your phone today** (free Apple ID). In a GitHub `main` clone at 0.8.12+:

   ```bash
   git clone https://github.com/motleyjames/circadia.git ~/circadia
   cd ~/circadia
   npm run put-on-phone
   ```

   That packs the diary and installs onto James-iPhone's hardware UDID. Signing does not open Xcode and does not use Any iOS Device. A leftover development profile is enough. A signed-in Xcode account is enough. A keychain certificate by itself is not. USB is only for the install if the idle tunnel never comes back; after Circadia is on the home screen, unplug — the app does not use the Mac, and Circadia has no cloud. First pair only: USB once, Trust This Computer. Enable Developer Mode if iOS asks. Trust the developer cert on the phone. Simulator, Safari “Add to Home Screen,” and sideloading skip Keychain or skip real users — they are not this path.

2. **Other people’s phones** (paid [Apple Developer Program](https://developer.apple.com/programs/), then TestFlight). Start enrollment before or while you cable-run; review can sit in the background. Then: Xcode → Product → Archive → Distribute → App Store Connect. Internal TestFlight is only for people already on your App Store Connect team (up to 100). Paid testers are an **external** group (email or public link) after the first TestFlight beta review. Builds last 90 days.

`npm run put-on-phone` runs `pack:static`, inlines the locked diary into `out/index.html`, `cap sync`, copies the phone `Documents/vault.json` onto this Mac as ciphertext (`fold-inbox.circadia`), then `xcodebuild` onto the hardware UDID (generic iOS compile if the phone is idle, then Apple's installer). A missing phone vault does not fail the install. A second run with the same commit and diary skips the Next.js rebuild. Circadia.app on the Mac still uses `next start` — do not set `CIRCADIA_PACK_STATIC` in `.env.local`. Bundle id is `app.circadia.diary`. Wind-down copy is honest — locking the phone may pause Web Audio. The iOS audio spike under `spikes/` is a local experiment, not this app.

Stay-signed-in: ciphertext in the app sandbox, AES key in iOS Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`). If Keychain writes fail, the next launch asks for the password. App Store Connect will ask about encryption: **yes** — the diary uses AES-GCM on device. Do not tick “HTTPS only.” No Android slice in this version.

CI YAML is `scripts/github-ci.yml`. Copy it to `.github/workflows/ci.yml` when the GitHub token has `workflow` scope.

## What this is not

Not medical care. Not a diagnosis. Not a prescription. If you snore and gasp, fall asleep while driving, or cannot stay awake, that is a clinic.

Melatonin is treated as a **clock signal**, not a sleeping pill. Magnesium is treated as **modest, mixed evidence**. CBT-I behaviors (fixed wake time, stimulus control, the hour off screens) outrank both.

Dream “meaning” is theme-tagging plus physiology (alcohol and REM rebound, medications). Circadia will not run a dream dictionary.

## Why this way

A remote model would be more fluent and less honest. Sleep data is intimate; the diary stays on-device unless someone joins the study. Join is the only send. Night packs stay stripped. The roster is a participant number and sleep window, not a name and not a contact list. James reads stats in the operator app (`npm run mod`) on a Mac — never on the phone. The Mac wrap is a native window around that same local app; the iPhone wrap is Capacitor around the static diary pack. See `docs/BLUEPRINT.md`.
