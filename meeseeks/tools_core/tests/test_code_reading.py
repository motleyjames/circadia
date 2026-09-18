"""
read_code: the only probe that answers a question about BEHAVIOUR.

Its verdict is trusted for exactly one reason - the model must quote a line
that really exists in the file, and the quote is checked before the verdict
counts. These tests hold that guarantee down, including against a model that
invents a line.
"""

import json

from core.meeseeks_data_classes import ProbeType
from probes.meeseeks_code_reading import (
    citation_holds, extract_symbol, module_header, parse_verdict,
)


def _reply(verdict, quote, line=1, why="because of the quoted line"):
    return json.dumps({"verdict": verdict, "quote": quote, "line": line, "why": why})


REAL_LINE = "            return {\"status\": \"error\", \"error\": type(e).__name__}"


class TestVerdicts:
    def test_honest_verdict_with_a_real_citation_is_accepted(
            self, executor, ctx, probe, stub_reader):
        stub_reader["reply"] = _reply("concern_is_unfounded", REAL_LINE, 28)
        r = executor.execute(
            probe(ProbeType.READ_CODE, in_file="src/delivery.py", symbol="send_email",
                  question="Does the error path leak the credential?"), ctx)
        assert r.result["verdict"] == "concern_is_unfounded"
        assert r.result["kind"] == "code_reading"
        assert r.result["conclusive"] is True
        assert r.confidence_impact > 0

    def test_confirming_verdict_costs_confidence(self, executor, ctx, probe, stub_reader):
        stub_reader["reply"] = _reply("concern_is_real", REAL_LINE, 28)
        r = executor.execute(
            probe(ProbeType.READ_CODE, in_file="src/delivery.py",
                  question="Is the error path unsafe?"), ctx)
        assert r.verified is False
        assert r.confidence_impact < 0

    def test_invented_citation_discards_the_verdict(self, executor, ctx, probe, stub_reader):
        stub_reader["reply"] = _reply(
            "concern_is_real", '    logger.error(f"failed: {app_password}")', 99)
        r = executor.execute(
            probe(ProbeType.READ_CODE, in_file="src/delivery.py",
                  question="Does it log the password?"), ctx)
        assert r.confidence_impact == 0.0, "a fabricated citation may not move confidence"
        assert "does not appear" in r.evidence
        assert "verdict" not in (r.result or {})

    def test_cannot_tell_is_recorded_as_nothing(self, executor, ctx, probe, stub_reader):
        stub_reader["reply"] = _reply("cannot_tell", REAL_LINE, 28)
        r = executor.execute(
            probe(ProbeType.READ_CODE, in_file="src/delivery.py", question="Is it safe?"), ctx)
        assert r.confidence_impact == 0.0

    def test_missing_file_is_reported_not_guessed(self, executor, ctx, probe, stub_reader):
        stub_reader["reply"] = _reply("concern_is_unfounded", REAL_LINE)
        r = executor.execute(
            probe(ProbeType.READ_CODE, in_file="src/nope.py", question="Is it safe?"), ctx)
        assert r.confidence_impact == 0.0
        assert "not a file" in r.evidence

    def test_garbage_output_moves_nothing(self, executor, ctx, probe, stub_reader):
        for bad in ("not json", "{}", _reply("maybe", REAL_LINE),
                    _reply("concern_is_real", ""), '{"verdict":"concern_is_real","quote":123}'):
            stub_reader["reply"] = bad
            r = executor.execute(
                probe(ProbeType.READ_CODE, in_file="src/delivery.py",
                      question="Is this safe to ship?"), ctx)
            assert r.confidence_impact == 0.0, f"moved confidence on: {bad[:40]}"


class TestSourceGivenToTheReader:
    def test_a_file_that_fits_is_sent_whole(self, executor, ctx, probe, stub_reader):
        """Narrowing to a symbol hides the module constants it depends on."""
        stub_reader["reply"] = _reply("concern_is_unfounded", REAL_LINE, 28)
        executor.execute(
            probe(ProbeType.READ_CODE, in_file="src/delivery.py", symbol="send_email",
                  question="Which exceptions are retried?"), ctx)
        shown = stub_reader["prompt"]
        assert "TRANSIENT_EXCEPTIONS = (" in shown, "the reader must see the tuple"
        assert "RETRY_ATTEMPTS = 3" in shown
        assert "def send_email" in shown

    def test_module_header_captures_constants_and_imports(self):
        src = "import os\nX = 1\n\n\ndef f():\n    return X\n"
        header = module_header(src)
        assert "import os" in header and "X = 1" in header
        assert "def f" not in header

    def test_symbol_extraction_returns_a_slice(self):
        src = "A = 1\n\n\ndef target():\n    return A\n\n\ndef other():\n    pass\n"
        got = extract_symbol(src, "target")
        assert got is not None
        body, line = got
        assert "def target" in body and "def other" not in body
        assert line == 4


class TestCitationChecking:
    def test_exact_line_holds(self):
        assert citation_holds("  x = 1", "def f():\n  x = 1\n  return x\n")

    def test_invented_line_does_not(self):
        assert not citation_holds("  x = 99", "def f():\n  x = 1\n")

    def test_empty_or_trivial_quotes_rejected(self):
        assert not citation_holds("", "anything")
        assert not citation_holds("x", "x = 1")
        assert not citation_holds(None, "x = 1")


class TestVerdictParsing:
    """The parser must ignore braces INSIDE strings - source code is full of them."""

    def test_unbalanced_brace_in_a_cited_line(self):
        quote = '    return {"status": "error",'
        got = parse_verdict(_reply("concern_is_unfounded", quote))
        assert got is not None and got["quote"] == quote

    def test_lone_closing_brace(self):
        got = parse_verdict(_reply("cannot_tell", "        }"))
        assert got is not None

    def test_f_string_with_braces(self):
        quote = '  log.info(f"sent {n} of {total}")'
        got = parse_verdict(_reply("concern_is_unfounded", quote))
        assert got is not None and got["quote"] == quote

    def test_escaped_quote_inside_the_line(self):
        quote = '  x = "he said \\"hi\\""'
        assert parse_verdict(_reply("cannot_tell", quote)) is not None

    def test_markdown_fence_is_stripped(self):
        raw = "```json\n" + _reply("cannot_tell", "a{b") + "\n```"
        assert parse_verdict(raw) is not None

    def test_trailing_prose_is_ignored(self):
        assert parse_verdict(_reply("cannot_tell", "x{") + " and some chatter") is not None

    def test_nothing_parseable_returns_none(self):
        assert parse_verdict("no json here") is None
        assert parse_verdict("") is None
