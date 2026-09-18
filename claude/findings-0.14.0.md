# Findings - 20260918_171028

**Task:** Review the Circadia 0.14.0 build-hygiene change: tsconfig excludes meeseeks so root tsc does not typecheck the uninstalled automation tree, gitignore of harness run artifacts, npm test runs both vitest passes and exits with the worse code.

**Confidence:** 95%  
**Evidence:** 2 probe(s) established something conclusive against the source.

1 need a person - 5 settled by evidence - 11 open.

## Needs a person

_Evidence CONFIRMED these. The harness is not guessing - each one cites something real in the source._

### d_1_1  (code_probe_evidence - loop 1)
> The `npm test` script may use `&&` or `set -e` shell semantics that short-circuit on first failure, causing the second vitest suite to be skipped entirely when the first fails.

Probe 'check_value__npm_test_script_1555' CONFIRMS this concern: '"test": "vitest' appears in package.json at package.json:34 "test": "vitest run --exclude src/lib/static-surface.test.ts. The dissent stands and needs a person.

`probe: check_value__npm_test_script_1555`

## Open

_Nothing settled these. Either no probe could be built, or the evidence was inconclusive. They are not findings against your code._

### d_1_0  (none - loop 1)
> The root tsconfig exclude of meeseeks may already be shipping without a corresponding `meeseeks/tsconfig.json`, meaning there is currently no mechanism to typecheck the automation tree anywhere, leading to silent type rot.

No resolution strategy could handle this dissent

### d_1_3  (none - loop 1)
> The exit-code aggregation logic may use POSIX-only shell arithmetic (e.g., `$(( ))` or `$?` capture) that will fail silently or behave differently on Windows in CI environments using cmd or PowerShell.

No resolution strategy could handle this dissent

### d_1_4  (none - loop 1)
> If already-tracked harness artifacts exist in the repo, adding them to `.gitignore` without a corresponding `git rm --cached` will have no effect — they will continue to appear in diffs.

No resolution strategy could handle this dissent

### d_2_0  (none - loop 2)
> The tsconfig exclude pattern may use `"meeseeks"` instead of `"meeseeks/**"`, which could fail to exclude nested files depending on TypeScript's glob resolution behavior.

No resolution strategy could handle this dissent

### d_2_1  (none - loop 2)
> The composite test runner script may use `set -e` or `&&` chaining, which would cause the second Vitest pass to be skipped when the first fails, masking failures in the second suite.

No resolution strategy could handle this dissent

### d_2_2  (judgement - loop 2)
> The composite test runner's exit-code logic may not correctly handle signal-based exit codes above 128 (e.g., SIGTERM=143, SIGKILL=137), potentially reporting a killed process as a "lesser" failure than a normal test failure with exit code 1.

The concern is about a 'composite test runner' with exit-code logic, but no such file exists in the repository's module list — only Next.js app/component files and a media script are present, making t

### d_2_3  (none - loop 2)
> The gitignore patterns for harness run artifacts may be overly broad and could inadvertently ignore legitimate source or configuration files in the repository.

No resolution strategy could handle this dissent

### d_3_0  (none - loop 3)
> The exit-code aggregation may use bitwise OR (`code1 | code2`) instead of `Math.max(code1, code2)`, which can produce unexpected composite exit codes (e.g., `1 | 2 = 3`) that misrepresent the actual failure

No resolution strategy could handle this dissent

### d_3_1  (none - loop 3)
> The exit-code script may rely on POSIX shell arithmetic (`$(( ))`) rather than a Node wrapper, which would break on Windows developer environments

No resolution strategy could handle this dissent

### d_3_2  (none - loop 3)
> Production source files under `src/` may contain imports from the `meeseeks` path that would silently resolve when meeseeks is installed but are now invisible to root typechecking

No resolution strategy could handle this dissent

### d_3_3  (none - loop 3)
> The `.gitignore` patterns for harness artifacts may use overly broad globs that accidentally mask files that should be version-controlled

No resolution strategy could handle this dissent

## Settled by evidence

_Checked against the source and found not to apply._

### d_1_2  (code_probe_evidence - loop 1)
> The gitignore patterns for harness run artifacts may use broad globs (e.g., `*.log`, `output/`) that accidentally mask committed golden test fixtures or intentional baseline files.

Probe 'check_value__broad_log_glob_7614' settles this against the repository: '*.log' appears nowhere in .gitignore, which was read in full.

`probe: check_value__broad_log_glob_7614`

### d_2_4  (no_resolver - loop 2)
> On Windows without WSL/MSYS2, the shell-based exit-code aggregation logic (POSIX arithmetic expansion) may fail or behave incorrectly, causing `npm test` to always exit 0 or always exit non-zero.

No resolution strategy could handle this dissent

### d_2_4  (semantic_bridge_weak - loop 2)
> On Windows without WSL/MSYS2, the shell-based exit-code aggregation logic (POSIX arithmetic expansion) may fail or behave incorrectly, causing `npm test` to always exit 0 or always exit non-zero.


`probe: hypothesis_L2_H2`

### d_2_5  (no_resolver - loop 2)
> No dedicated CI step or tsconfig exists for the `meeseeks` subtree, meaning type regressions in automation code will accumulate silently until one is added.

No resolution strategy could handle this dissent

### d_2_5  (semantic_bridge_weak - loop 2)
> No dedicated CI step or tsconfig exists for the `meeseeks` subtree, meaning type regressions in automation code will accumulate silently until one is added.


`probe: hypothesis_L2_H1`
