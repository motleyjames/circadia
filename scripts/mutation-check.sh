#!/usr/bin/env bash
#
# mutation-check.sh — prove that the tests guarding an invariant actually die
# when that invariant breaks.
#
# For every row in scripts/mutations.json:
#   1. run the named test unmutated   (control: must pass AND report at least
#      one passed test. vitest -t is a regex, and a filter that matches nothing
#      in a file that exists skips every test and exits 0, so exit status alone
#      cannot prove the name is real. testName is escaped to a literal first.)
#   2. copy the source file to a temp backup
#   3. apply the literal find/replace, asserting the file actually changed
#      (a drifted find string would mutate nothing and report a survivor as killed)
#   4. run the same test again (nonzero = KILLED, zero = SURVIVED)
#   5. restore from the backup copy and assert the tree is clean again
#
# The runner never uses git to revert. Restores are file copies from a temp dir,
# so a mispathed path cannot reach past what it copied. A trap restores every
# backed-up file on EXIT, INT and TERM, so the tree is byte-identical even on
# an interrupt or an error.
#
# No arguments, no configuration. New invariants add rows to mutations.json.

set -euo pipefail

MANIFEST="scripts/mutations.json"

# ---------------------------------------------------------------- preflight --

repo_root="$(git --no-optional-locks rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$repo_root" ]; then
  echo "mutation-check: not inside a git repository" >&2
  exit 2
fi
if [ "$(cd "$repo_root" && pwd -P)" != "$(pwd -P)" ]; then
  echo "mutation-check: run from the repo root ($repo_root)" >&2
  exit 2
fi
if [ ! -f "$MANIFEST" ]; then
  echo "mutation-check: $MANIFEST not found" >&2
  exit 2
fi
if ! git --no-optional-locks diff --quiet || ! git --no-optional-locks diff --cached --quiet; then
  echo "mutation-check: tracked files are dirty. This runner rewrites source files" >&2
  echo "and restores them from a backup copy; it cannot tell your work in progress" >&2
  echo "from its own mutation. Commit or set aside your changes first." >&2
  exit 2
fi

BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/circadia-mutation.XXXXXX")"
BACKUPS=()

restore_all() {
  local keep=$?
  local pair target source
  for pair in ${BACKUPS[@]+"${BACKUPS[@]}"}; do
    target="${pair%%|*}"
    source="${pair#*|}"
    if [ -f "$source" ]; then
      cp -p "$source" "$target"
    fi
  done
  rm -rf "$BACKUP_DIR"
  return "$keep"
}
trap restore_all EXIT INT TERM

# ------------------------------------------------------------- manifest i/o --

# Single-line scalar fields only (id/file/testFile/testName). The multi-line
# find/replace strings are never handled in shell; node applies them directly.
manifest_field() {
  node -e '
    const fs = require("fs");
    const rows = JSON.parse(fs.readFileSync("scripts/mutations.json", "utf8"));
    const row = rows[Number(process.argv[1])];
    if (!row) { process.stderr.write("no mutation at index " + process.argv[1] + "\n"); process.exit(3); }
    const value = row[process.argv[2]];
    if (typeof value !== "string" || value === "") {
      process.stderr.write("mutation " + process.argv[1] + " has no " + process.argv[2] + "\n");
      process.exit(3);
    }
    process.stdout.write(value);
  ' "$1" "$2"
}

# Literal (non-regex) substitution. Exits 3 if the find string is not present
# exactly once, or if the rewrite would be a no-op.
apply_mutation() {
  node -e '
    const fs = require("fs");
    const rows = JSON.parse(fs.readFileSync("scripts/mutations.json", "utf8"));
    const row = rows[Number(process.argv[1])];
    const before = fs.readFileSync(row.file, "utf8");
    const parts = before.split(row.find);
    if (parts.length !== 2) {
      process.stderr.write("find string occurs " + (parts.length - 1) + " times in " + row.file + ", expected exactly 1\n");
      process.exit(3);
    }
    const after = parts.join(row.replace);
    if (after === before) {
      process.stderr.write("substitution left " + row.file + " unchanged\n");
      process.exit(3);
    }
    fs.writeFileSync(row.file, after);
  ' "$1"
}

count="$(node -e '
  const fs = require("fs");
  const rows = JSON.parse(fs.readFileSync("scripts/mutations.json", "utf8"));
  if (!Array.isArray(rows)) { process.stderr.write("manifest is not an array\n"); process.exit(3); }
  process.stdout.write(String(rows.length));
')"

echo "mutation-check: $count mutation(s) from $MANIFEST"
echo "mutation-check: backups in $BACKUP_DIR"
echo

RESULT_IDS=()
RESULT_VERDICTS=()
RESULT_CONTROL=()
RESULT_MUTANT=()

record() {
  RESULT_IDS+=("$1")
  RESULT_VERDICTS+=("$2")
  RESULT_CONTROL+=("$3")
  RESULT_MUTANT+=("$4")
}

# --------------------------------------------------------------- run the set --

i=0
while [ "$i" -lt "$count" ]; do
  id="$(manifest_field "$i" id)"
  file="$(manifest_field "$i" file)"
  test_file="$(manifest_field "$i" testFile)"
  test_name="$(manifest_field "$i" testName)"
  test_pattern="$(printf '%s' "$test_name" | sed 's#[][\.*^$?+(){}|]#\\&#g')"

  echo "── $id"
  echo "   file: $file"
  echo "   test: $test_file -t '$test_name'"

  if [ ! -f "$file" ]; then
    echo "   MANIFEST-STALE: $file does not exist"
    record "$id" "MANIFEST-STALE" "-" "-"
    echo
    i=$((i + 1))
    continue
  fi

  # 1. control run — the test must pass against untouched source.
  control_exit=0
  npx vitest run "$test_file" -t "$test_pattern" >"$BACKUP_DIR/$i-control.log" 2>&1 || control_exit=$?
  echo "   control exit: $control_exit"
  if [ "$control_exit" -eq 0 ] && ! grep -Eq 'Tests .*passed' "$BACKUP_DIR/$i-control.log"; then
    control_exit=97
    echo "   control ran no test: the name matches nothing in $test_file."
  fi
  if [ "$control_exit" -ne 0 ]; then
    echo "   CONTROL-FAIL: test does not pass unmutated (or the name matches nothing)."
    echo "   log: $BACKUP_DIR/$i-control.log"
    tail -n 12 "$BACKUP_DIR/$i-control.log" | sed 's/^/     | /'
    record "$id" "CONTROL-FAIL" "$control_exit" "-"
    echo
    i=$((i + 1))
    continue
  fi

  # 2. back up by copy, never by git.
  backup="$BACKUP_DIR/$i-$(basename "$file")"
  cp -p "$file" "$backup"
  BACKUPS+=("$file|$backup")

  # 3. mutate, asserting the file really changed.
  apply_exit=0
  apply_mutation "$i" || apply_exit=$?
  if [ "$apply_exit" -ne 0 ]; then
    echo "   MANIFEST-STALE: the find string no longer matches this file."
    cp -p "$backup" "$file"
    record "$id" "MANIFEST-STALE" "$control_exit" "-"
    echo
    i=$((i + 1))
    continue
  fi

  # 4. mutant run.
  mutant_exit=0
  npx vitest run "$test_file" -t "$test_pattern" >"$BACKUP_DIR/$i-mutant.log" 2>&1 || mutant_exit=$?
  echo "   mutant exit: $mutant_exit"
  if [ "$mutant_exit" -ne 0 ]; then
    verdict="KILLED"
  else
    verdict="SURVIVED"
    echo "   SURVIVED: the test passed with the invariant broken."
    echo "   log: $BACKUP_DIR/$i-mutant.log"
  fi
  echo "   $verdict"

  # 5. restore and prove it.
  cp -p "$backup" "$file"
  if ! git --no-optional-locks diff --quiet; then
    echo "mutation-check: restore of $file did not clean the tree. Stopping." >&2
    git --no-optional-locks status --short >&2
    exit 2
  fi

  record "$id" "$verdict" "$control_exit" "$mutant_exit"
  echo
  i=$((i + 1))
done

# ------------------------------------------------------------------- report --

echo "─────────────────────────────────────────────────────────────────────────"
printf '%-38s  %-14s  %-9s  %-9s\n' "ID" "VERDICT" "CONTROL" "MUTANT"
echo "─────────────────────────────────────────────────────────────────────────"
failures=0
j=0
while [ "$j" -lt "${#RESULT_IDS[@]}" ]; do
  printf '%-38s  %-14s  %-9s  %-9s\n' \
    "${RESULT_IDS[$j]}" "${RESULT_VERDICTS[$j]}" "${RESULT_CONTROL[$j]}" "${RESULT_MUTANT[$j]}"
  if [ "${RESULT_VERDICTS[$j]}" != "KILLED" ]; then
    failures=$((failures + 1))
  fi
  j=$((j + 1))
done
echo "─────────────────────────────────────────────────────────────────────────"

if git --no-optional-locks diff --quiet && git --no-optional-locks diff --cached --quiet; then
  echo "tree: clean"
else
  echo "tree: DIRTY"
  git --no-optional-locks status --short
  exit 1
fi

if [ "$failures" -ne 0 ]; then
  echo "$failures of ${#RESULT_IDS[@]} mutation(s) were not killed."
  exit 1
fi

echo "all ${#RESULT_IDS[@]} mutation(s) killed."
exit 0
