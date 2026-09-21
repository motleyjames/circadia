# Circadia 0.9.0 — full-app audit and fixes

Three parallel audits (clinical content, interface, runtime), every sharp claim re-verified against the running app before acting, then fixed and re-verified. **464 tests passing** (was 454), `tsc` fully clean for the first time, walked end to end in a real browser.

Delivered as `circadia-0.9.0.tar.gz` — 68 files, paths preserved. The device bridge dropped before it could be written directly.

```bash
cd ~/circadia && tar -xzf ~/Downloads/circadia-0.9.0.tar.gz
rm -f .git/index.lock && git add -A
git commit -m "Full-app audit: safety triage, data-integrity fixes, night-safe UI. 0.9.0."
git push && npm run put-on-phone
```

---

## 1. Safety — verified broken, now fixed

Every one of these was confirmed by running the shipped engine and reading its actual reply.

| What was typed | What it answered before |
|---|---|
| "I want to kill myself I haven't slept in days" | *"I don't have a solid note on that. Ask about falling asleep, 3 a.m. wakings, alcohol…"* — a topic menu |
| "I keep falling asleep at the wheel" | Insomnia-onset advice: *"Do not get in to try… get in when you are actually sleepy"* — i.e. **delay your bedtime**, to someone describing drowsy driving |
| "I stop breathing in my sleep" | Withheld entirely |
| "my wife says I choke in my sleep" | Withheld entirely |
| "how much melatonin should I take" (age 15) | Adult dosing, from a library note that says not to start it under 18 without a clinician |
| "I drink a bottle of wine every night to sleep" | *"two dry nights"* — abrupt cessation advice to someone describing dependence |

Cause: the topic ladder matches on sleep words, and the most urgent things people type contain those same words. `fall asleep` matched "falling asleep at the wheel".

**New `src/lib/safety-triage.ts` runs before every other route** — crisis, drowsy driving, witnessed apnea, mania, days without sleep, alcohol dependence, and a minor/child dosing gate. Each names what it heard, points at a human, and never shows a topic menu. Ten regression tests in `safety-triage.test.ts`.

Note on design intent: the ambient crisis line stays always-on and un-gated, exactly as originally built. What changed is the *reply* to an explicit disclosure.

## 2. Clinical content

Corrections: jet-lag cited the AASM 2015 guideline, which explicitly **excludes** jet lag (now AASM 2007; the 2015 CPG moved to the new delayed-phase note, where it belongs). Core-temperature drop was stated as 1–2 °C, roughly double reality (~0.5–1 °C), and omitted the actionable finding — bathing 1–2 h before bed, not immediately before. The Z-drug warning said "odd nighttime behavior" for what is an FDA boxed warning, with no opioid-combination caution. Tylenol PM / Advil PM were described only as antihistamines, omitting the acetaminophen and ibuprofen — a real double-dosing route. The restless-legs note cited the 2025 guideline but omitted its headline change (augmentation on dopamine agonists). A 13-year-old was told 8–10 h; the NSF school-age band is 9–11.

Six new library notes for the gaps a real patient hits — **racing mind / night-time anxiety** (the single most common insomnia complaint, previously a withhold), **sleep restriction** (the first-line treatment, with its bipolar / seizure / untreated-apnea / professional-driver contraindications), **nocturia**, **menopause**, **delayed phase / night owls**, and **sleep trackers / orthosomnia**. Library is now 35 notes with search.

## 3. Data integrity

- **`saveState` never reached durable storage.** It wrote only to localStorage; `vault.json` updated on login, not on filing a morning. WebKit evicts local storage under pressure — weeks of nights could vanish behind a stale disk copy. Now debounced to disk on every save. *Verified in the running app: `PUT /api/vault` now fires on save.*
- **Vault merge resolved ties toward the stale disk copy.** AES-GCM ciphertext length tracks plaintext length, so correcting a rating 3 → 4 produced an exact tie and the old value won; withdrawing a morning made the blob smaller and lost outright. Envelopes now carry a monotonic `rev` and merge on it. *Verified: `rev: 3` stamped on disk.*
- **A corrupt phone vault reported as a successful empty read**, then got overwritten with `{}` — erasing the last remaining copy. Parse failure is now `unavailable`, and an empty write over a non-empty file is refused.
- **Morning date was recomputed every render** — an interview started at 23:58 filed as *tomorrow's* morning, mis-attributing the night and permanently blocking the real one. Frozen at mount.
- **The anonymity guard permanently blocked** anyone whose medication or supplement name matched a class label the pack legitimately carries — every participant on bupropion or melatonin, two of the largest cohorts an insomnia study has.
- Quota and encryption failures were swallowed silently; now recorded and surfaceable.

## 4. Tonight, and the 3 a.m. bug

`shouldBeOffScreens` covers only the hour *before* bedtime, so past bedtime the hero fell through to "time until screens down" — at 03:00 it read **"19:00:00 to screens down"**, and the progress arc collapsed to its 6% floor exactly when it should have been full. To the one person most likely to be looking at it. There is now a third state: time until wake, with copy that does not scold someone for being awake.

## 5. Interface

- **The clock mark was broken app-wide — a regression I introduced in 0.8.20.** A CSS transform replaces the SVG `transform` attribute, so the ring lost its `translate(64 64)` and was drawn around the viewBox origin. Verified by rendering it at 200px; now a correct clock. (The exact trap the codebase's own comments warn about.)
- **Pure-white `bg-zinc-50` buttons** — 19.6:1 on an OLED screen, on every gate and all six intake steps — replaced with a night-safe violet primary token.
- **`zinc-600` (2.6:1) and `zinc-700` (2.0:1)** retired for text; 53 occurrences remapped.
- **The crisis line was the lowest-contrast text in the app** — 10px at 2.6:1. Now 13px, readable, with 988 as a real `tel:` link.
- Keyboard focus was invisible across the entire Mac app — one base `:focus-visible` rule added.
- Nav icons were flooded with `fill="currentColor"` when active, turning BookOpen and User into solid blobs. Now colour + weight + a soft halo.
- The 6.6s open is tap-to-skip.
- Two dead buttons that silently did nothing (intake Continue with a blank age; the interview's file button) now disable or explain.
- `.phone-page-y` was unlayered, so it beat every Tailwind utility and the Mac app carried phone padding on every screen. Two Circadia wordmarks between 768–1280px. Internal enum names ("LEVER", "STEADY") shown as UI copy.

## 6. Also

Notifications never re-armed after the 6-hour cap, so anyone who opened the app in the morning never got that evening's ping. The wind-down audio graph ran all night after a guide ended. Sleep midpoint could be an hour wrong via a lossy clock-string round trip. `crypto.randomUUID` was unguarded on the study-join tap. And the pre-existing `KeyboardResize` type error — which had been failing `tsc` and `next build` on any clean clone, i.e. blocking CI — is fixed.

## Still open
- Cannot back-fill a missed morning (only today's). The highest-value remaining feature for an insomnia population.
- Interview and intake answers are lost if you navigate away mid-flow.
- Type scale (22 arbitrary sizes), radii, and ten near-identical surface colours want collapsing into tokens; 8 unused shadcn primitives can be deleted.
- The two servers still validate study packs differently.
