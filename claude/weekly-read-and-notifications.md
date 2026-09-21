# Weekly read + notifications — built (0.11.0 pushed, gate fix in 0.12.0)

Approved artifacts **Circadia Weekly Read** and **Circadia Notifications** remain the
visual reference.

---

## The weekly read

The first attempt shipped the raster correctly and then bolted it onto the *old*
Notes page, which was three thousand pixels of prose. James: *"it looks nothing like
the preview did. its all words and no appeal."* He was right — the approved structure
(picture → numbers → sentence → comparison) was buried under a four-line lede, a
duplicate "This week / A split week" essay, night-by-night prose bullets, a dreams
card and a decorative sky-blue bar chart of durations with no axis.

`insights-view.tsx` is now the approved order, and nothing was deleted — the longer
read, the night notes and "what I would try" moved behind native `<details>`
disclosures in the order someone would ask for them:

1. **Header** — date range, then `standingOn()`: *"7 of 7 mornings scored. Enough to
   see a pattern, not enough to prove a cause."* The denominator goes before the
   numbers, not in a footnote.
2. **Your nights** — the raster.
3. **The numbers** — efficiency hero + four tiles, each with a week-over-week delta.
4. **Where your nights sat** — midpoint plot; the social-jet-lag sentence folded in
   here as its caption, which retired the standalone "Last 4 weeks" card.
5. **What I read** — `week-sentence.ts`, one derived paragraph.
6. **Better and worse** — two compact columns of facts.
7. **Every night, in numbers** — the table.

Deleted outright: the 3-chip row and the bar chart. The chart used **sky** while the
raster used **violet** — the exact pair the dataviz validator rejected (ΔE 1.7 under
deuteranopia). Two chart languages on one page. Colour is now one hue at two
lightnesses everywhere.

### `week-sentence.ts`
Turns the geometry into the sentence a clinician says first: the in-bed/asleep gap,
then which third of the night the waking time sat in (front / middle / end), chosen
by the largest of latency, WASO and terminal wakefulness. Three rules pinned by test:
never diagnose, never prescribe a sleep window (sleep restriction is real and
genuinely dangerous self-administered), never scold.

---

## Defects found and fixed while building this

- **`terminalMinutes` could be 1440.** `overnightDuration(a, a)` returns a full day,
  which is right for "asleep 23:00, awake 23:00" and wrong for every other pair in a
  night. Get up the same minute you wake and an eight-hour night reported 24 hours of
  lying awake. `nightGeometry` now lays the night out **once** as offsets from getting
  into bed and does subtraction on that line; the midnight ambiguity is resolved in
  one place (`forwardMinutes`) and an ordering check rejects anything that cannot be a
  real night. This was shipping in the 0.10.0 James was about to push.
- **The raster axis clipped real people, twice.** Splitting the day at noon sent a
  12:10 lie-in to −530 (fixed earlier); splitting at 9pm then sent a 7:45pm bedtime off
  the right edge. Now: minutes since **3pm**, with the visible window measured from the
  nights themselves.
- **Midpoint spread was not circular.** Two nights twenty minutes apart across midnight
  would have read as 23h40m. `midpointSpread` finds the largest gap on the circle and
  reports the complement.
- **The table hid the column that matters.** Six columns at `min-w-[34rem]` on a 420px
  phone put efficiency off-screen with no scroll affordance. Reordered to
  Night · Eff. · Asleep · … with an edge fade.
- **Axis tick labels collided** at the window ends ("11pm 12am" as one smear). Ends are
  dropped when within 70 minutes of an interior tick.
- **Test fixtures used inputs no user can enter.** `sleepLatencyMinutes` is a
  `LatencyBucket` (5|15|30|50|75); several fixtures used 0, 10, 20. Caught by tsc.

---

## Notifications

Three, and that is the whole set.

| When | Title | Body |
|---|---|---|
| 1 h before target sleep | **Screens down** | "Asleep by 11 pm gives you your window. Dim the room — no need to open this." |
| Target wake + 25 min, only if unfiled | **Morning** | "Two minutes on last night, while it is still fresh. Rough answers are fine." |
| 2 h before screens-down, evening before the next scheduled morning, ≥4 scored nights | **Your week is in** | The finding itself: nights, mean asleep, efficiency, and whether that is inside the healthy range. |

### Architecture
- **`sleep-notifications.ts`** — pure. Profile + diary + a clock in, the complete set
  of pings out. Every rule is testable because nothing here touches a device.
- **`notify-device.ts`** — the only file that talks to the OS. Cancel-then-schedule
  the whole set rather than diffing, so a ping cannot outlive its reason.
- **`notifications.ts`** — trimmed to `shouldBeOffScreens`, which is all Tonight needs.

### The bug this replaces
The old module guarded on the browser's notification object, which **is not exposed in
a Capacitor WKWebView** (Safari 16.4 added Web Push for home-screen PWAs, not embedded
webviews), then fired from a `setTimeout`, which only survives while the app is open.
It had never fired on the iPhone, silently, since it shipped. `@capacitor/local-notifications@8.3.1`
schedules on-device: fires with the app closed, no server, no APNs cert, no push token
— nothing about a schedule leaves the phone. Added to **both** `package.json` files
**and to `includePlugins` in `capacitor.config.ts`** — that list is an allowlist, and an
unlisted plugin is compiled out entirely, `isPluginAvailable` false, every ping dropped.

### Rules, each pinned by a test
1. **Nothing between screens-down and morning.** `withinQuietHours` is asserted against
   four schedules including a night shift where the window does not cross midnight.
2. **Complete on the lock screen.** No teaser wording; the weekly carries the finding.
3. **Silence when there is nothing to say.** <4 scored nights, no weekly. A filed
   morning removes that day's ping.
4. **No streaks, no guilt, no win-backs.** A regex over every generated body.
5. **Ask late, but never "never".** Permission is requested once the OS still reports
   `prompt` AND at least one morning is filed — removed from onboarding, where it was
   prompting on the install screen. iOS asks once, and a cold decline cannot be undone
   from inside the app.

Ids are derived from kind + date, so replanning replaces the same three slots instead
of stacking duplicates every time the app reopens. Horizon is 7 days, well under iOS's
64 pending-notification cap.

### The gate that could never open (fixed 0.12.0)

James: *"can we get the notifications working"*. They could not have.

The first version asked for permission only while filing a morning when
`prev.reports.length === 0` — the very first morning ever. **Anyone who already had a
diary was permanently unaskable**, which was everyone already using the app. The switch
in You read on, permission was never granted, `syncNotifications` found none and
returned 0. Silent nothing — the exact failure this module exists to end, rebuilt one
layer up in the caller.

- **Asking moved out of `addReport`** into the sync effect: ask when the OS reports
  `prompt`, the toggle is on, and at least one morning is filed. Once per session,
  guarded by a ref.
- **`notificationPermission()`** exposes granted / denied / prompt / unavailable. On
  `denied` the store switches `notificationsEnabled` off, so the UI can never claim to
  be on while iOS drops every ping, and You names the escape route out loud — Settings
  → Notifications → Circadia — because nothing inside the app can undo a denial.
- **A test ping.** Every real reminder is hours away, so "is this even on?" was
  unanswerable without waiting until bedtime. You now has *Send a test*, five seconds
  out, under `TEST_PING_ID = 999_999_999` — above every derived id (which top out in
  the millions), proven by test, so it can never collide with a real ping.

Four tests pin this, including one asserting `reports.length === 0` never returns to
the store.

---

## Still to verify on the real device
1. The permission sheet appears on next launch (toggle already on + a filed morning).
2. *Send a test* arrives.
3. A screens-down ping arrives with the app force-quit.
4. An iOS **Sleep Focus** starting at 10pm will suppress a 10pm screens-down ping.
   Scheduling is against wind-down and overridable, but this needs a real check.

## Next
- Back-fill a missed morning — only today's can be filed.
- PROMIS severity instrument; clinician export (14-night grid → print → PDF).
