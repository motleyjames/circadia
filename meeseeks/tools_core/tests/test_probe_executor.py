"""
CodeProbeExecutor: what a probe is allowed to conclude from what it found.

The rules under test, each of which was once wrong and cost a real run:
  - a search that finds nothing settles something ONLY if it was scoped to a
    file that was read in full
  - a count with nothing to compare against verifies nothing
  - a test command that cannot collect is UNVERIFIED, not a broken invariant
  - a path may not escape the repository root
"""

import sys

import pytest

from core.meeseeks_data_classes import ProbeType


class TestSearchScope:
    def test_repo_wide_miss_establishes_nothing(self, executor, ctx, probe):
        r = executor.execute(probe(ProbeType.CHECK_EXISTS, identifier="no_such_symbol_xyz"), ctx)
        assert r.verified is False
        assert r.confidence_impact == 0.0, "an unscoped miss must not move confidence"
        assert not r.result.get("conclusive")

    def test_file_scoped_miss_is_conclusive(self, executor, ctx, probe):
        r = executor.execute(
            probe(ProbeType.CHECK_EXISTS, identifier="no_such_symbol_xyz",
                  in_file="src/delivery.py"), ctx)
        assert r.result.get("conclusive") is True
        assert r.result.get("searched_file") == "src/delivery.py"
        assert "read in full" in r.evidence

    def test_scoped_hit_is_conclusive_too(self, executor, ctx, probe):
        r = executor.execute(
            probe(ProbeType.CHECK_VALUE, expected="RETRY_ATTEMPTS",
                  in_file="src/delivery.py"), ctx)
        assert r.verified is True
        assert r.result.get("conclusive") is True

    def test_real_symbol_is_found(self, executor, ctx, probe):
        r = executor.execute(probe(ProbeType.CHECK_EXISTS, identifier="send_email"), ctx)
        assert r.verified is True
        assert r.result.get("kind") == "symbol"

    def test_scope_falls_back_to_a_file_named_in_the_concern(self, executor, ctx, probe):
        r = executor.execute(
            probe(ProbeType.CHECK_VALUE, dissent="set_debuglevel in src/delivery.py would leak",
                  expected="set_debuglevel"), ctx)
        assert r.result.get("conclusive") is True, "the concern named a real file; use it"
        assert r.result.get("searched_file") == "src/delivery.py"

    def test_explicit_in_file_beats_the_task(self, executor, ctx, probe):
        r = executor.execute(
            probe(ProbeType.CHECK_VALUE, expected="unrelated_helper", in_file="src/other.py"),
            {**ctx, "prime_directive": "verify src/delivery.py"})
        assert r.result.get("searched_file") == "src/other.py"


class TestCounting:
    def test_count_without_an_expectation_verifies_nothing(self, executor, ctx, probe):
        r = executor.execute(
            probe(ProbeType.COUNT_ITEMS, target_type="occurrences", identifier="attempt"), ctx)
        assert r.verified is False
        assert r.confidence_impact == 0.0

    def test_count_matching_an_expectation_verifies(self, executor, ctx, probe):
        cmd = [sys.executable, "-m", "pytest", "tests/", "-q", "--no-header"]
        r = executor.execute(
            probe(ProbeType.COUNT_ITEMS, target_type="tests", expected_count=2),
            {**ctx, "test_command": cmd})
        assert r.verified is True
        assert r.result["expected"] == 2

    def test_expected_count_as_a_string_still_compares(self, executor, ctx, probe):
        cmd = [sys.executable, "-m", "pytest", "tests/", "-q", "--no-header"]
        r = executor.execute(
            probe(ProbeType.COUNT_ITEMS, target_type="tests", expected_count="2"),
            {**ctx, "test_command": cmd})
        assert r.verified is True, "'2' and 2 must not read as a mismatch"

    def test_non_numeric_expectation_is_unverified(self, executor, ctx, probe):
        cmd = [sys.executable, "-m", "pytest", "tests/", "-q", "--no-header"]
        r = executor.execute(
            probe(ProbeType.COUNT_ITEMS, target_type="tests", expected_count="two"),
            {**ctx, "test_command": cmd})
        assert r.confidence_impact == 0.0

    def test_scoped_zero_count_is_conclusive_absence(self, executor, ctx, probe):
        r = executor.execute(
            probe(ProbeType.COUNT_ITEMS, target_type="occurrences",
                  identifier="set_debuglevel", in_file="src/delivery.py"), ctx)
        assert r.result.get("conclusive") is True


class TestSuiteProbe:
    def test_passing_suite_verifies(self, executor, ctx, probe):
        cmd = [sys.executable, "-m", "pytest", "tests/", "-q", "--no-header"]
        r = executor.execute(probe(ProbeType.CHECK_INVARIANT), {**ctx, "test_command": cmd})
        assert r.verified is True
        assert r.confidence_impact > 0

    def test_uncollectable_suite_is_unverified_not_broken(self, executor, ctx, probe):
        cmd = [sys.executable, "-m", "pytest", "no_such_dir/", "-q", "--no-header"]
        r = executor.execute(probe(ProbeType.CHECK_INVARIANT), {**ctx, "test_command": cmd})
        assert r.verified is False
        assert r.confidence_impact == 0.0, "a bad command is not a failing invariant"

    def test_missing_binary_reports_the_reason(self, executor, ctx, probe):
        r = executor.execute(probe(ProbeType.CHECK_INVARIANT),
                             {**ctx, "test_command": ["definitely-not-a-binary", "tests/"]})
        assert r.confidence_impact == 0.0
        assert "could not be run" in r.evidence


class TestSafety:
    def test_sibling_directory_escape_is_refused(self, executor, tmp_path):
        root = tmp_path / "repo"
        (tmp_path / "repo-evil").mkdir()
        root.mkdir()
        assert executor._safe_path(root, "../repo-evil/secret.py") is None

    def test_absolute_and_home_paths_refused(self, executor, tmp_path):
        assert executor._safe_path(tmp_path, "/etc/passwd") is None
        assert executor._safe_path(tmp_path, "~/secrets") is None

    @pytest.mark.parametrize("params", [
        {"expected": None}, {"expected": ["a", "b"]}, {"identifier": {"a": 1}},
        {"in_file": 12345, "expected": "x"}, {"expected": "x", "in_file": "../../etc/passwd"},
    ])
    @pytest.mark.parametrize("ptype", [ProbeType.CHECK_VALUE, ProbeType.CHECK_EXISTS])
    def test_malformed_parameters_never_crash(self, executor, ctx, probe, params, ptype):
        from core.meeseeks_data_classes import ProbeResult
        assert isinstance(executor.execute(probe(ptype, **params), ctx), ProbeResult)


class TestNeedleExtraction:
    def test_apostrophes_in_prose_are_not_quotes(self, executor, probe):
        p = probe(ProbeType.CHECK_EXISTS,
                  dissent="the mailer doesn't handle SMTP timeouts, that's a real risk")
        assert executor._needle_from_dissent(p) is None

    def test_a_genuinely_quoted_identifier_is_used(self, executor, probe):
        p = probe(ProbeType.CHECK_EXISTS, dissent='the "send_email" path is wrong')
        assert executor._needle_from_dissent(p) == "send_email"
