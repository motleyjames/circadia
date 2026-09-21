# The phone open never actually played (0.8.25)

James, after installing 0.8.24: *"the footer is correct but the animation has not changed"* — and then, after a clean delete-and-reinstall, *"still isn't landing, I see Circadia instantly."*

## The contradiction that cracked it
Two facts that could not both be true of the same build:

- The gate footer read **0.8.24** — that string comes from `public/index.html` **inside the app bundle**, so a new bundle was definitely installed.
- "Circadia" appeared **instantly** on launch — **impossible** on 0.8.24, whose `LaunchScreen.storyboard` has no labels at all (verified in the compiled `.storyboardc` in the bundle).

Build was ruled out first, on evidence rather than assumption: `App.debug.dylib` contains `CircadiaSky` (130 refs), `CircadiaMarkView` (84), `arriveWords`, and both bundled font names; `Fonts/` and `UIAppFonts` are present; binary is newer than every source file. (Aside: the 92KB `App` executable is only a launcher stub — Xcode 16 debug builds put app code in `App.debug.dylib`, so `strings App` finds nothing and is a misleading place to look.)

So the code shipped and ran. Therefore the wordmark being instantly present had to come from the overlay itself — meaning `arm()` had already run and finished before the app was visible.

## Root cause
`CircadiaOpenWindow.arm()` had three callers:

| Caller | Guarded? |
|---|---|
| `CircadiaBridgeViewController.viewDidAppear` | ✅ `applicationState == .active` |
| `SceneDelegate.sceneDidBecomeActive` | ✅ active by definition |
| `AppDelegate` → Capacitor `capacitorViewDidAppear` → `CircadiaSurface.nudge()` | ❌ **none** |

Capacitor posts `capacitorViewDidAppear` **while the launch screen is still up and the app is inactive**. UIKit *completes* `UIView.animate` work scheduled while inactive, and Core Animation added before the first presented frame never shows. So the entire open — mark draw, sky rise, staggered wordmark — ran to completion off-screen. Worse, `armed = true` was set, so the correct later call from `sceneDidBecomeActive` was a no-op.

The result on device: the app appears with the identity simply *present*, no animation. **This affected every version from 0.8.20 onward** — the choreography has never once run on the phone, which is exactly why the Dock always looked better.

The previous author had seen this failure mode and guarded `viewDidAppear` (its comment reads *"Only arm while active"*) but missed the notification path added later.

## Fix
- The guard moved **inside `arm()`**, where every caller must pass through it. Not-yet-active is a **retry** (0.1s ticks, ~4s ceiling), never a skip — so whichever caller arrives first, the open still plays once the app is genuinely on screen.
- `AppDelegate`'s observer now carries a comment explaining it is a hint that the webview exists, not permission to play.
- **Reduce Motion** got a real path instead of an instant dump: the clock arrives finished, but the sky and the identity cross-fade in (0.15/0.35/0.55s stagger, opacity only, no drift), and the recede fades over 0.7s. Reduce Motion asks for no *movement*, not no *transition* — the system itself cross-fades. `arriveWords(moving:)` now serves both paths; `settleWords()` deleted.

## Guarding it
New test `refuses to arm until the app is active, so the open cannot play off-screen` asserts the guard exists, that it appears **before** `armed = true`, that the retry path is present, and that both `arriveWords(moving:)` variants are wired. AGENTS.md gained the invariant. Clean-clone suite: **454 passing**, 3 pre-existing environment-only failures.

## Lesson for this codebase
Any native work that draws the open must be gated on the app being active. Lifecycle notifications from Capacitor fire earlier than they look like they do, and animations scheduled before the first presented frame silently succeed — which is far more confusing than a crash, because every artifact (build, bundle, version, install) looks correct.
