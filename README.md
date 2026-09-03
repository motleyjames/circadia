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

Circadia 0.10.0 — two compiles, two opens. Dock fade is a CSS cover inside Circadia.app. Phone open is UIKit. They must not share a `.next` folder.

`pack:static` / `put-on-phone` writes `out/`. Next 16 `output: "export"` with a custom distDir treats that folder as `out/` and still builds into `.next`, so Circadia does not use `.next-phone` as distDir. Pack stashes a stamped diary-server `.next` (`.next-dock-stash`), exports, then restores. Quit Circadia.app before `put-on-phone` so the running `next start` is not standing on that folder. `skipWebOpenCover` is Capacitor-only (`isPhoneNative()`), never a `NEXT_PUBLIC_` flag Next inlines into Circadia.app. After a poisoned pack, Circadia.app rebuilds when `.next/circadia-kind` is missing or the tree is `output: "export"`. Circadia.app also strips those pack env vars in the Swift launcher, so `open Circadia.app` from the same terminal as `put-on-phone` cannot `next start` a phone export.

The 0.8.18 UIKit open never reached James-iPhone (Swift braces, then CoreDevice 1011). USB listed is not a live DDI tunnel. `put-on-phone` still requires the tunnel connected. After a successful install the native open shows **0.10.0** under Circadia.

0.8.22 is the open as one piece of motion: the clock draws for about 3.6s (ring, pivot, ticks, hands, moon, halo) while the wordmark arrives in three layers; it rests 0.8s; then it recedes in layers over 2.2s — version and tagline lift, the title follows, the mark dissolves outward with the halo blooming, the night thins — and the diary does not wait to be revealed, it rises 14px into place under the thinning scrim. On the phone the UIKit window pings `circadia-surface` at the start of its recede so the web diary arrives under the native scrim on the same beats. Outgoing lifts before incoming arrives. 0.8.21 slowed the draw (0.8.20 drew it in 1.45s and it read as a flicker). 0.8.20 is the clock that draws itself. On both shells the open is now the mark coming alive — ring strokes in from 12, ticks blink, hands sweep from 12 and settle, the moon rises, the halo breathes once — then the wordmark and scrim recede into the diary. iPhone: `CircadiaMarkView` (Core Animation) inside `CircadiaOpenWindow`. Dock: the same choreography as CSS keyframes on the SVG internals — the cover itself is never transformed. Reduce Motion shows the finished clock, no sweep. About 3.6s of draw, a 0.8s rest, a 2.2s layered recede with the diary arriving underneath.

0.8.25 is why none of that was visible on the phone. `CircadiaOpenWindow.arm()` could be called by Capacitor's `capacitorViewDidAppear`, which fires while the launch screen is still up and the app is inactive — and UIKit *completes* animations scheduled while inactive, so the entire open ran off-screen and the identity was simply present when the app appeared. `viewDidAppear` guarded that; the notification path did not. The guard now lives inside `arm()` where every caller must pass it, and a not-yet-active call retries instead of spending the open. Reduce Motion now cross-fades the identity in rather than dumping it on screen — the system does the same, and an instant appearance reads as a bug.

0.8.24 closes the gap between the two opens. The phone was the weaker of the pair for three reasons, all fixed: its launch screen showed the finished wordmark, so there was nothing left to play — it is now a dark wait (`brand-open-wait`), and `CircadiaOpenWindow` assembles the identity in layers on the Dock's beats (title 1.2s, tagline 1.6s, stamp 2.0s); its wordmark was Georgia, not the brand — Fraunces and Outfit now ship in the bundle as static TTFs pinned to the axis values the browser renders (wght 400, SOFT 50, WONK 0.4), at 45.6pt with the Dock's -0.03em tracking; and it sat on flat black rather than a sky — `CircadiaSky` paints the same three radial washes and five stars as `.night-sky` / `.glow-veil`, waking under the draw so nothing pops. Fonts are subset to ASCII, about 22KB each, and carry their OFL licences.

Same diary. Not a second product. **Operator is never in this binary.** Tonight is the clock. **Ask** is a word, not a sixth tab. Five tabs: Tonight, Morning, Notes, Library, You. Layout is the only difference: phone is bottom tabs + Ask sheet, Dock is sidebar + rail. 0.8.18 plays the phone open in UIKit: LaunchScreen and a second window (above the webview) already show Circadia, then the window recedes with `UIView.animate` after the scene is active. CSS inside WKWebView never faded on the iPhone (0.8.13–0.8.17). The packed diary skips the web cover. 0.8.17 stays signed in on Circadia.app after Quit: the master lives in the app's Keychain, not in Node's `security` CLI (that ACL dies when PATH/Node changes after a Dock pull). The open shows this version under the wordmark so a stale iPhone binary is obvious. 0.8.16 installs only an iPhone .app whose packed diary is this version, uses the storyboard window (does not spawn a second invisible bridge), keeps a native night cover on that window until the diary paints its wait frame, then lifts the cover and pings so the fade starts on screen. Capacitor's `capacitorDidLoad` runs before the page exists — a ping then is wiped. 0.8.15 is the phone open matching Dock: WKWebView cannot fade a wordmark inside a transformed cover (it freezes the first bitmap), so the identity is an opacity transition, and play waits for a native on-screen ping. 0.8.14 fades one identity into the diary: a solid night scrim that matches the native launch screen, then scrim and wordmark lift together — no stroke-draw, no box-scale, no second overlay dissolve. 0.8.13 played the open from a dark wait that matches the native launch screen. 0.8.12 folds nights both ways at USB: the phone absorbs the packed Mac diary into a diary that already has mornings, and Circadia.app folds a phone vault copied at `put-on-phone`. They are still not a live cloud pair. 0.8.11 holds a still mark under the native splash then dissolves, loads bedside WAVs even when Capacitor reports status 0, ticks the in-app clock from the phone clock, and treats a 200 that is not an inbox as held — not “Send failed (200)”. 0.8.10 plays the open after the native splash, loads the bedside guides as PCM without needing the mixer first, and keeps the study pipeline honest on a phone that has no inbox. 0.8.9 only installs when CoreDevice has a live tunnel — a paired-but-disconnected Wi-Fi row is not a target. 0.8.8 is the round clock: Tonight’s countdown is an SVG circle clipped to a circle, not a square glow box. 0.8.7 is the open and the sky: the mark draws on launch, Tonight is one atmosphere instead of three boxes, and a night filed on the phone folds into Circadia.app from a locked copy — they are not a live cloud pair. 0.8.6 keeps stay-signed-in by swapping those five views inside one JS lifetime. Do not set `ios.scrollEnabled: false`.

The iPhone starts empty unless the locked diary from the Circadia that installed it is packed into the build. Circadia is local-first: there is no cloud account. `npm run put-on-phone` **fails** if it cannot pack a diary, then compiles onto James-iPhone's hardware UDID even if the phone is idle, and **refuses to install** until CoreDevice says the tunnel is connected (USB or live Wi-Fi). A device list that says `unavailable` is an idle tunnel, not an install target — xctrace listing the UDID does not count as connected. After `BUILD SUCCEEDED` it waits up to ten minutes for that live tunnel, then tries native-run, then Apple’s installer with the hardware UDID only. Signing uses a leftover development profile for this phone if one exists; otherwise the Apple ID in Xcode Accounts (including Xcode 16 team keys). It does not pass a keychain-only team into automatic signing, and it does not use destination Any iOS Device. Log in with the same email or phone and password. The gate footer must read `0.10.0 · diary packed`. If Circadia.app opens with no fade, quit it fully and reopen — the first launch after this pull rebuilds `.next` when the server stamp is missing. That does not update the iPhone; run `put-on-phone` for that.

**Move nights onto the phone**

Unlock James-iPhone and keep the screen on. Open Circadia.app so it can write the locked file, then **Quit Circadia.app fully** so pack is not renaming `.next` out from under `next start`. Then, with no comments on these lines:

```bash
cd ~/circadia
git pull
npm run put-on-phone
```

If it stops with “No locked diary”, log in on Circadia.app, wait, run it again. If install still cannot open a tunnel, stay plugged in and unlocked for that one run — the Next.js pack will not rebuild unless the diary or the commit changed. After the footer reads **0.10.0 · diary packed**, **Quit Circadia.app fully and reopen**, then reopen the phone so each side can fold the other’s nights. Unplug — the installed app does not talk to the Mac. **Log in** with the same password. After that one login, Circadia.app must not ask again until you tap Log out.

Or: Circadia → **You** → **Save a locked copy**. AirDrop `circadia-locked.circadia`. On the other Circadia, **Fold nights from a locked copy**. That keeps mornings already there. **Bring a locked diary** still replaces.

A morning filed on the phone lands on Circadia.app after `put-on-phone` plus a full quit-and-reopen of Circadia.app (USB copy of the phone vault, then fold). Between those steps they are two local copies. AirDrop fold still works. Local-first: there is no live pair.

Signing up on the phone starts a second diary. A leftover signup with no nights is replaced when the packed password is correct. A leftover diary that already has mornings keeps them and folds packed mornings in.

Apple is the remaining gate, not more app code. Two tracks, started in parallel:

1. **Your phone today** (free Apple ID). In a GitHub `main` clone at 0.10.0+:

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

## Security posture

The diary listens on 127.0.0.1. That is not the same as private: while Circadia is open, a page on any site the user visits can send a request to that port, and a no-preflight POST goes through whether or not the browser lets the page read the answer. So the local servers treat every request as untrusted.

- **Only this origin may drive the inbox.** `/api/study` refuses a request carrying another site's `Origin` — `isLocalRequest` in the Next routes, `localOrigin` in `electron/static-server.cjs`. The same guard already covers vault, fold-inbox and locked-diary.
- **Caller input never becomes a path.** A stored pack is named from a participant id that has passed an anchored UUID check, then a containment assert. Packs are written `0600`.
- **The server may not be killed by a request.** Nothing throws out of the request handler: a malformed percent-escape (`GET /%`) used to end the process and take Circadia.app down with it. Reads are guarded, and a last-resort catch answers 500 rather than exiting.
- **Files are resolved, not just normalized.** A served path must sit inside the UI root after `realpath`, so a symlink under the root cannot point out of it.
- **Every response carries** `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `no-referrer`, `no-store` — the diary is never framed, sniffed, or cached by another page.

0.8.23 closed all of the above. They were found by auditing the shipped Mac server, and each one has a regression test in `src/lib/static-server.test.ts`. A scan that reports findings inside `.next-mod/`, `out/`, `phone/ios/App/App/public/` or `phone/ios/DerivedData/` is reading build output, not this repo — those are all gitignored.

## What this is not

Not medical care. Not a diagnosis. Not a prescription. If you snore and gasp, fall asleep while driving, or cannot stay awake, that is a clinic.

Melatonin is treated as a **clock signal**, not a sleeping pill. Magnesium is treated as **modest, mixed evidence**. CBT-I behaviors (fixed wake time, stimulus control, the hour off screens) outrank both.

Dream “meaning” is theme-tagging plus physiology (alcohol and REM rebound, medications). Circadia will not run a dream dictionary.

## Why this way

A remote model would be more fluent and less honest. Sleep data is intimate; the diary stays on-device unless someone joins the study. Join is the only send. Night packs stay stripped. The roster is a participant number and sleep window, not a name and not a contact list. James reads stats in the operator app (`npm run mod`) on a Mac — never on the phone. The Mac wrap is a native window around that same local app; the iPhone wrap is Capacitor around the static diary pack. See `docs/BLUEPRINT.md`.
