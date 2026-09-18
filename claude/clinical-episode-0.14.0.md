# Clinical episode 0.14.0 — Stage 1

```
BASELINE:   563 tests passing, tsc clean
AFTER:      587 tests passing, tsc clean
NEW TESTS:  19 in src/lib/episode.test.ts
```

Same three environment-only failures as Phase 0 (`data/study-inbox` gitignored;
generated `phone/ios/App/App/capacitor.config.json` missing). Pass 2 was run by
hand. `tsc --noEmit` is clean.

The diary can now carry a course of care. It does not show one. Solo mode is still
every existing file: `episode: null`, same nights, same study switch.

This is the type, the fold, and the hydrate. Not a screen.

## What landed

`src/lib/episode.ts` is the clinical state machine. An `Episode` is one bounded
course with one clinician. A `TreatmentWindow` is a prescribed time in bed. The
app never computes a window. `createTreatmentWindow` is the only construction
site that writes `prescribedInBed:`; hydrate reconstructs from stored clinician
JSON using shorthand properties so that greppable invariant stays true.

`CircadiaState.episode` is `Episode | null`, same shape as `profile`. Absent or
malformed input hydrates to `null`. A half-valid episode is not repaired.

`mergeDiaryStates` now carries an episode. Highest `rev` wins, whole object, no
field-level merge of `windows`. The case Phase 0 flagged — local solo, incoming
has an episode — keeps the incoming copy. Different ids keep local and return a
conflict from `foldEpisode`.

`forwardMinutes` is exported from `sleep-metrics.ts`. `windowAdherence` uses it
and nothing else. Missing `inBedAt` / `outOfBedAt` returns null even when a
window is active; `adherenceUnavailableReason` says which. Sleep-onset clocks
are not a substitute.

`nextState` takes `intakeComplete` as a boolean. It does not read
`profile.onboardingComplete`. It never walks review → treatment, treatment →
maintenance, or anything → discharged on its own. Treatment without an active
window is not treatment.

Study packs still cannot name an episode. `anonymityViolations` now treats
window `rationale` like dream text.

## What the spec got wrong, and what we did

Phase 0 was right about the fold. `VaultEnvelope.rev` and `kdf: 2` are
ciphertext ordering and password-lock migration. They do not merge diary
fields. The fix is on `mergeDiaryStates`, with `Episode.rev` as an explicit
counter so a tie cannot happen by accident. Tie goes local, same bias as
`...local`.

"hydrateState unchanged in shape" was poorly worded. The contract for existing
fields is unchanged. The closed reconstruction grew one field. Old files
without the key become `episode: null`. New saves write `"episode": null` the
way they already write `"profile": null`. That is not byte-identical JSON to
0.13.0 — it is the same convention the file already uses for nullables.

Decision 6 said `episode.ts` must not import `sleep-metrics.ts`. Decision 3
said `windowAdherence` must call `forwardMinutes` and must not wrap or
duplicate it. Those cannot both be true. The import is `forwardMinutes` only.
`createTreatmentWindow` still cannot see a report or a geometry. The test pins
that.

## Fold conflict recording

0.9.0's swallowed-failure path is `persistFailure()` / `lastPersistError` in
`storage.ts`. It is I/O. `diary-fold.ts` is pure, and the authorised storage
edits were `emptyState`, `hydrateState`, and `coerceEpisode` — not
`foldLockedVaultIntoSession`. So the conflict is returned from `foldEpisode`
and dropped by `mergeDiaryStates` after local wins. A later stage should pass
it to `persistFailure` or a sibling, or the operator will never hear that two
episodes disagreed.

This `rev` rule is enough only while there is no transport. Once two devices
can each receive a clinician window, last-writer on `rev` will drop one. That
is a Stage 2 prerequisite, not a Stage 1 bug.

## Found, not fixed

1. **`npm test` exits 1 on pass 1, so pass 2 never runs.**
   The script is `vitest run --exclude src/lib/static-surface.test.ts && vitest run src/lib/static-surface.test.ts`.
   In this clone pass 1 fails on three checkout-only tests (`data/study-inbox`
   is gitignored; `phone/ios/App/App/capacitor.config.json` is generated).
   `static-surface.test.ts` therefore never executes unless someone runs it by
   hand. Invisible on the developer Mac, where pass 1 is green. The 0.10.0
   two-pass harness did not make pass 2 reachable after a pass-1 failure.

2. **`NIGHT_KEYS` omits the Consensus Sleep Diary fields.**
   `inBedAt`, `triedToSleepAt`, `outOfBedAt`, `awakeningCount`, `napMinutes`
   are not on the night pack. Every collected pack is still pre-0.10.0
   geometry. Sleep efficiency cannot be computed from the inbox.
   `sleep-data-spec-1.0` §6 asked for this and it did not land.

3. **`overnightDuration(a, a) === 1440` is still the helper in `time.ts`.**
   Contained, not removed. `forwardMinutes` is the night-line answer (0 for a
   same-clock pair). Every caller of `overnightDuration` outside
   `sleep-metrics.ts` is unaudited. Changing it is not Stage 1 work.

## Still open, not this stage

- Back-filling a missed morning. Prerequisite for any pilot. An invented
  denominator corrupts the baseline the clinician reads.
- Intake battery. Stage 3. Until then the caller passes `intakeComplete`.
- UI. No `.tsx` was touched. A later stage can say "no window" versus
  "missing clocks" because the predicate exists.
- Wiring `foldEpisode` conflicts into `persistFailure`.
- A merge rule that survives two devices both receiving windows.
- Putting CSD fields on the study pack.
- Making `npm test` run pass 2 after pass 1 fails.

## Version

This tree is still 0.13.0. James bumps to 0.14.0 himself. Do not run these on
the Cursor cloud VM if they would also rewrite darwin `node_modules`.

```
python3 - <<'PY'
from pathlib import Path
pairs = [
    ("package.json", '"version": "0.13.0"', '"version": "0.14.0"'),
    ("src/lib/version.ts", 'export const APP_VERSION = "0.13.0"', 'export const APP_VERSION = "0.14.0"'),
    ("src/lib/dock-install.test.ts", 'expect(APP_VERSION).toBe("0.13.0")', 'expect(APP_VERSION).toBe("0.14.0")'),
    ("src/lib/phone-shell.test.ts", "0.13.0", "0.14.0"),
    ("src/lib/phone-shell.test.ts", "CURRENT_PROJECT_VERSION = 41", "CURRENT_PROJECT_VERSION = 42"),
    ("phone/ios/App/App.xcodeproj/project.pbxproj", "MARKETING_VERSION = 0.13.0", "MARKETING_VERSION = 0.14.0"),
    ("phone/ios/App/App.xcodeproj/project.pbxproj", "CURRENT_PROJECT_VERSION = 41", "CURRENT_PROJECT_VERSION = 42"),
]
readme = Path("README.md")
text = readme.read_text()
text = text.replace("0.13.0", "0.14.0")
readme.write_text(text)
for path, old, new in pairs:
    p = Path(path)
    body = p.read_text()
    if old not in body:
        raise SystemExit(f"missing {old!r} in {path}")
    p.write_text(body.replace(old, new))
lock = Path("package-lock.json").read_text().splitlines(True)
changed = 0
out = []
for i, line in enumerate(lock):
    if changed < 2 and line.strip() == '"version": "0.13.0",' and (i < 12):
        out.append(line.replace("0.13.0", "0.14.0"))
        changed += 1
    else:
        out.append(line)
if changed != 2:
    raise SystemExit(f"lockfile replacements: {changed}")
Path("package-lock.json").write_text("".join(out))
print("0.14.0")
PY
```

`phone-shell.test.ts` also asserts the gate-only `put-on-phone` stdout contains
the version. The script above replaces every `0.13.0` in that file, including
the test title. Check the diff before committing. Do not replace
`node_modules/retry`'s `"version": "0.13.0"` in the lockfile — only the two
root entries (lines 3 and 9).

Do not run `npm install` or `npm ci` on the Mac after the bump if darwin
`node_modules` is already resolved.
