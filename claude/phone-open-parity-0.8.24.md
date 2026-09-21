# Why the phone open looked worse than the Dock — and the fix (0.8.24)

James: "the animation on the dock app is way better than the phone app." Three concrete causes, all fixed.

## 1. The phone had nothing to play
The Dock cover runs `wait → play → hold → recede`. **`wait` is a dark frame with the identity at opacity 0**, and the whole wordmark then assembles: title at 1.2s, tagline 1.6s, stamp 2.0s, each fading up and settling the last 6px (`word-arrive`).

The phone's `LaunchScreen.storyboard` showed the *finished* wordmark, and `CircadiaOpenWindow` had to match that first frame exactly or it would visibly jump — so `identity.alpha = 1` from birth. **Only the clock moved; the type just sat there.** That is the bulk of the quality gap.

**Fix:** LaunchScreen is now the dark wait — flat `#05040a`, no labels at all (it is also a much simpler, lower-risk storyboard). `CircadiaOpenWindow.arriveWords()` assembles the identity on the Dock's exact beats. No pop is possible because there is no type on the launch screen to mismatch.

## 2. The wordmark was Georgia, not the brand
Dock renders **Fraunces** — variable, `font-variation-settings: "SOFT" 50, "WONK" 0.4`, `tracking-tight` (-0.03em), 2.85rem = 45.6px, weight 400 (Tailwind preflight resets `h1` to inherit). The phone used **Georgia 42pt**, a completely different serif. Body copy was system SF instead of **Outfit**.

iOS cannot load the `.woff2` the web build uses, and the source is a variable font whose *defaults* are wrong (wght defaults to 900, SOFT to 0, WONK to 1 — nothing like what the browser renders).

**Fix:** instanced both faces with fontTools at the exact axis values the browser uses (`wght 400, opsz 46, SOFT 50, WONK 0.4` for Fraunces; `wght 400` for Outfit), subset to ASCII, saved as static TTFs — **~22KB each** — into `phone/ios/App/App/Fonts/`, registered via `UIAppFonts`, added to the Xcode Resources phase. `UIFont(name: "CircadiaSerif-Regular")` with a Georgia → system-serif fallback chain, so a missing font degrades instead of crashing. OFL licences ship beside them. Title now 45.6pt with `.kern: -0.03 * 45.6`; the version stamp is uppercase, `0.18em` tracked, zinc-700 — matching the Dock exactly.

Regenerate with fontTools if the web faces ever change (noted in AGENTS.md).

## 3. Flat black instead of a sky
Dock sits on `.night-sky` (three radial washes) + `.glow-veil` (five stars). The phone overlay was solid `#05040a`.

**Fix:** new `CircadiaSky.swift` reproduces all three washes as radial `CAGradientLayer`s at the same fractional centres/radii/stops, plus the five stars at their exact positions and colours. It **fades up over 1.8s under the draw** (`sky.rise`) so it grows out of the flat launch night rather than popping, and goes out with the scrim on recede.

## Verification
- Clean-clone suite: **453 passing**, 3 failures — all pre-existing and environment-only (generated `capacitor.config.json`, gitignored `data/study-inbox`).
- `native-open.test.ts`: 9/9, including two new cases pinning the dark-wait launch screen, the staggered arrival beats, the bundled fonts + plist registration + pbxproj wiring, and the sky.
- All three Swift files brace-balanced; `weakSelfViolations` clean on the new one. `tsc` and eslint clean.
- Font sanity-checked: no missing or empty glyphs, "Circadia" = 174px at 45.6pt (fits a 320pt screen with margins).

## Files
New: `phone/ios/App/App/CircadiaSky.swift`, `phone/ios/App/App/Fonts/{CircadiaSerif-Regular,CircadiaSans-Regular}.ttf` + OFL licences.
Changed: `SceneDelegate.swift`, `LaunchScreen.storyboard`, `Info.plist`, `project.pbxproj` (Sources + Resources + version 34), `native-open.test.ts`, `phone-shell.test.ts`, `dock-install.test.ts`, `version.ts`, `README.md`, `AGENTS.md`. Version 0.8.23 → 0.8.24.

## Note on pushing
Claude cannot run git writes or `put-on-phone` from the Cowork bridge: it is a **Linux VM** (no `xcodebuild`), the mount forbids `unlink` so git's object writes fail mid-`add`, and the VM has no git identity or credential helper. Verified the repo is left clean — HEAD `1f9d13f`, empty index, `fsck` clean. James commits and pushes from his own terminal.
