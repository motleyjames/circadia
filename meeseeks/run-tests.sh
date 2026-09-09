#!/usr/bin/env bash
# Run the harness's own test suite.
#
# Finds a Python that has pytest, without you having to remember where the venv
# lives in this particular repo. Run it from anywhere:
#
#     ./meeseeks/run-tests.sh          # from the repo root
#     ./run-tests.sh                   # from meeseeks/
#     ./run-tests.sh -k citation -v    # extra args go straight to pytest
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

has_pytest() { [ -x "$1" ] && "$1" -c "import pytest" >/dev/null 2>&1; }

CANDIDATES=()
[ -n "${VIRTUAL_ENV:-}" ] && CANDIDATES+=("$VIRTUAL_ENV/bin/python")
CANDIDATES+=("../venv/bin/python" "venv/bin/python" "$HOME/projects/meeseeks-venv/bin/python")
CANDIDATES+=("$(command -v python3 || true)")

PY=""
for c in "${CANDIDATES[@]}"; do
  if [ -n "$c" ] && has_pytest "$c"; then PY="$c"; break; fi
done

if [ -z "$PY" ]; then
  echo "No Python with pytest found. Tried:" >&2
  printf '  %s\n' "${CANDIDATES[@]}" >&2
  echo >&2
  echo "Install it into whichever environment you use, e.g.:" >&2
  echo "  ../venv/bin/python -m pip install pytest" >&2
  exit 1
fi

echo "Harness test suite  ($("$PY" -c 'import sys;print(sys.executable)'))"
exec "$PY" -m pytest "$@"
