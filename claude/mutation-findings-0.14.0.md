# Mutation check 0.14.0 — Stage 1 invariants

```
MANIFEST:  scripts/mutations.json, 3 mutations
RESULT:    2 killed, 1 survived, 0 stale, 0 control-fail
TREE:      clean
SUITE:     588 + 3
```

A green suite is not evidence that a test guards anything. It is evidence that
the test passes. This harness breaks the code on purpose and checks that the
named test dies. Two of the three Stage 1 invariants are really held by a test.
One is not.

`bash scripts/mutation-check.sh` takes no arguments. Later stages add rows to
`scripts/mutations.json`; the runner does not change.

## How it runs

Per row: run the named test untouched (**control** — this also proves the test
name is real, since vitest fails a run that matches zero tests, so a typo would
otherwise read as a killed mutant), copy the file to a temp dir, apply a literal
find/replace and assert the file actually changed (**manifest-stale** if not —
a drifted `find` string mutates nothing, passes, and reports a survivor as
killed), run the test again, restore from the backup copy, assert
`git --no-optional-locks diff --quiet`.

The runner never uses git to revert. Backups are file copies under `mktemp -d`,
restored by `cp`, with a trap on `EXIT INT TERM`. A mispathed `git checkout --`
would destroy uncommitted work; a temp-file backup cannot reach past what it
copied. It refuses to start on a dirty tree, because it cannot tell your work in
progress from its own mutation.

## Verdicts

```
ID                                      VERDICT     CONTROL  MUTANT
fold-drops-incoming-episode             KILLED      0        1
window-built-outside-factory            KILLED      0        1
adherence-falls-back-to-fellAsleepAt    SURVIVED    0        0
```

### fold-drops-incoming-episode — KILLED

`src/lib/diary-fold.ts`, `episode: folded.episode,` → `episode: local.episode,`.

The 0.9.0 `...local` regression, put back: local solo, incoming carries a course
of care, and the fold silently drops it. `diary-fold.test.ts` → *"takes an
incoming episode when this diary has none"* fails. The invariant is guarded.

### window-built-outside-factory — KILLED

`src/lib/storage.ts`, `coerceTreatmentWindow`, shorthand `prescribedInBed,` →
explicit `prescribedInBed: prescribedInBed,`.

Invariant 1 is enforced textually. `episode.test.ts` walks every non-test
`.ts`/`.tsx` under `src/` via `sourceFiles("src")` and requires
`/prescribedInBed\s*:/` to match `src/lib/episode.ts` alone. `storage.ts` is
inside that scan scope and is the one other place a `TreatmentWindow` literal is
assembled — it stays off the scan only because it uses property shorthand, as
`clinical-episode-0.14.0.md` says it does deliberately. That is the realistic
drift: someone tidies a shorthand key into an explicit one and a second
construction site for a prescribed window appears in a diary-hydration module.
The rewrite typechecks identically, so nothing else moves.

`episode.test.ts` → *"prescribedInBed: is an object-literal key in exactly one
non-test file, episode.ts"* fails. The scan catches it.

The corollary is worth saying out loud: the invariant is spelled, not
structural. It catches a new `prescribedInBed:` key. It would not catch a window
built through a helper, a spread, or a computed key.

### adherence-falls-back-to-fellAsleepAt — SURVIVED

`src/lib/episode.ts`, `windowAdherence`:

```ts
  if (adherenceUnavailableReason(report, window) !== null) return null;
  const actualInBed = report.inBedAt!;
```

became

```ts
  if (!window) return null;
  if (!isClock(report.outOfBedAt)) return null;
  const actualInBed = report.inBedAt ?? report.fellAsleepAt;
```

A night with no `inBedAt` is now scored against sleep onset. Adherence gets
computed from a clock the patient never said they were in bed at. The test
passed anyway.

**The test that should have caught it** is `episode.test.ts` →
*"names missing clocks separately from no window, and never falls back to sleep
onset"*:

```ts
const noClocks = report({ inBedAt: undefined, outOfBedAt: undefined, fellAsleepAt: "23:00", wokeAt: "07:00" });
expect(adherenceUnavailableReason(noClocks, window)).toBe("missing-clocks");
expect(windowAdherence(noClocks, window)).toBeNull();
const onlyIn = report({ inBedAt: "00:30", outOfBedAt: undefined });
expect(windowAdherence(onlyIn, window)).toBeNull();
```

Its name claims the fallback. What it actually asserts is that
`windowAdherence` returns null whenever **`outOfBedAt`** is missing — both cases
drop that clock, so the surviving `outOfBedAt` guard returns null before the
`inBedAt` fallback is ever reachable, and the `fellAsleepAt: "23:00"` on the
first fixture is never read by anything.

No test anywhere in the suite calls `windowAdherence` with `inBedAt` absent and
`outOfBedAt` present. The four call sites are: window `null` (twice), both
clocks absent, `outOfBedAt` absent, and both clocks present (twice). The one
shape that would expose a sleep-onset fallback is not covered.

This is a hole in the test, not a bug in `episode.ts`. Shipped
`windowAdherence` is correct — it delegates to `adherenceUnavailableReason` and
never looks at `fellAsleepAt`. Nothing in `src/` is broken today. What is broken
is the claim that a test is holding the line.

## Found, not fixed

1. **Invariant 3 had no test. Now it does — uncommitted.** Three lines were
   added inside the existing `it`, so the manifest row still points at the
   right test name and `scripts/mutations.json` did not change:

   ```ts
   const onlyOut = report({ inBedAt: undefined, outOfBedAt: "07:05", fellAsleepAt: "23:30" });
   expect(adherenceUnavailableReason(onlyOut, window)).toBe("missing-clocks");
   expect(windowAdherence(onlyOut, window)).toBeNull();
   ```

   The mutation now dies: `AssertionError: expected { earlyInMinutes: 60, …(2) }
   to be null` — the fallback scored `fellAsleepAt` 23:30 against a 00:30
   prescribed in-bed as an hour early. Suite is 588 + 3, unchanged, because the
   case went into an existing test.

   That verdict came from replicating the runner's per-row steps by hand
   against manifest row 2, not from `scripts/mutation-check.sh`, which refuses
   to start while `episode.test.ts` is uncommitted (see 2).

2. **The clean-tree guard blocks the workflow the harness exists to serve.**
   Fix a test, prove the mutant now dies — that is the loop. But the preflight
   aborts on any dirty tracked file, so the test fix has to be committed before
   the runner will confirm it, which is committing a test on the strength of an
   unverified claim. The guard is not wrong: the post-restore assertion is
   `git diff --quiet`, which needs a clean baseline to mean anything. The fix
   is to capture a baseline at start — the `git diff` of the files the manifest
   touches — and assert restoration returns to *that*, rather than to clean.
   Not changed here; it was a deliberate instruction, not an oversight.

3. **`window-built-outside-factory` relies on `storage.ts` keeping shorthand.**
   Nothing enforces that. A formatter or an eslint `object-shorthand` rule set
   the other way would trip invariant 1 on a file that is doing nothing wrong.

4. **The runner shells out to `npx vitest` twice per row.** Six runs for three
   mutations, about a minute. Fine at this size. It will not stay fine.

## Suite

Both passes were run by hand after the mutation run, on a restored tree.

```
vitest run --exclude src/lib/static-surface.test.ts    68 files, 588 tests
vitest run src/lib/static-surface.test.ts               1 file,    3 tests
```

`npm test` is two passes. Never run a bare `vitest run` across the whole suite:
`static-surface.test.ts` parks `src/app/api`, so it has to run alone.

## Committing

Nothing here is committed. Three new files, no tracked file modified:

```
git add scripts/mutations.json scripts/mutation-check.sh claude/mutation-findings-0.14.0.md
git commit -m "Mutation harness for the Stage 1 episode invariants."
```
