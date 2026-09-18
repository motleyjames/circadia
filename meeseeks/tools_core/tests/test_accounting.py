"""
Confidence and cost: the two numbers a run reports.

Both were once wrong in the same direction - flattering. Confidence rose for
completing a loop; an unpriced model was billed at zero. These tests pin the
honest behaviour.
"""

import pytest

from core.meeseeks_llm_caller import (
    _extract_responses_text, _raise_with_body, _record_usage, reset_usage, usage_summary,
)
from reasoning.loop_runner import _bounded_impact


class TestHypothesisImpactBounds:
    """A model grades its own guess. It does not get to choose the weight."""

    @pytest.mark.parametrize("verdict,raw,want", [
        ("CONFIRMED", 0.9, 0.15),
        ("CONFIRMED", 0.10, 0.10),
        ("REFUTED", 0.08, -0.05),
        ("REFUTED", -0.5, -0.10),
        ("PARTIAL", "lots", 0.02),
        ("INCONCLUSIVE", 0.9, 0.02),
        ("INCONCLUSIVE", None, 0.0),
    ])
    def test_clamped_into_its_verdict_range(self, verdict, raw, want):
        assert _bounded_impact(verdict, raw) == want

    def test_a_refuted_verdict_can_never_help(self):
        assert _bounded_impact("REFUTED", 5.0) < 0


class TestCostAccounting:
    def setup_method(self):
        reset_usage()

    def test_priced_models_are_totalled(self):
        _record_usage("claude-opus-4-6", {"usage": {"input_tokens": 1_000_000,
                                                    "output_tokens": 0}})
        u = usage_summary()
        assert u["calls"] == 1
        assert u["by_model"]["claude-opus-4-6"]["priced"] is True
        assert u["total_cost_usd"] > 0

    def test_an_unpriced_model_is_flagged_not_billed_at_zero(self, monkeypatch):
        import core.meeseeks_llm_caller as caller
        monkeypatch.setattr(caller, "load_router_config",
                            lambda: {"models": {"mystery-model": {"cost": None}}})
        _record_usage("mystery-model", {"usage": {"input_tokens": 5000, "output_tokens": 500}})
        u = usage_summary()
        assert u["unpriced"] == ["mystery-model"]
        assert u["by_model"]["mystery-model"]["priced"] is False

    def test_google_usage_shape_is_understood(self):
        _record_usage("gemini-flash-latest",
                      {"usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 20}})
        assert usage_summary()["by_model"]["gemini-flash-latest"]["input"] == 100

    def test_a_response_without_usage_is_ignored(self):
        _record_usage("claude-opus-4-6", {"content": []})
        assert usage_summary()["calls"] == 0


class TestOpenAIResponsesAPI:
    """Newer OpenAI models are served only on /v1/responses."""

    @pytest.mark.parametrize("body,want", [
        ({"output": [{"type": "message",
                      "content": [{"type": "output_text", "text": "hello"}]}]}, "hello"),
        ({"output_text": "convenience field"}, "convenience field"),
        ({"output": [{"type": "reasoning", "content": []},
                     {"type": "message",
                      "content": [{"type": "output_text", "text": "after reasoning"}]}]},
         "after reasoning"),
        ({"output": []}, ""),
        ({}, ""),
    ])
    def test_text_extraction(self, body, want):
        assert _extract_responses_text(body) == want


class TestErrorReporting:
    """The provider says what is wrong; raise_for_status threw that away."""

    class _Resp:
        def __init__(self, code, body):
            self.status_code, self._b, self.text = code, body, "raw body"

        def json(self):
            if self._b is None:
                raise ValueError("not json")
            return self._b

    def test_the_api_message_survives(self):
        r = self._Resp(400, {"error": {"message": "max_output_tokens must be >= 16"}})
        with pytest.raises(RuntimeError, match="max_output_tokens must be >= 16"):
            _raise_with_body(r, "openai", "gpt-5.3-codex")

    def test_a_non_json_body_still_reports_something(self):
        with pytest.raises(RuntimeError, match="429"):
            _raise_with_body(self._Resp(429, None), "google", "gemini-flash-latest")

    def test_success_does_not_raise(self):
        _raise_with_body(self._Resp(200, {}), "anthropic", "claude-opus-4-6")


class TestEnvParsing:
    def test_whitespace_and_export_prefixes_are_handled(self, tmp_path, monkeypatch):
        import core.meeseeks_llm_caller as caller
        env_file = tmp_path / "API_CONFIG.env"
        env_file.write_text(
            "# a comment\n"
            "ANTHROPIC_API_KEY = sk-ant-spaced \n"
            'export OPENAI_API_KEY="sk-quoted"\n'
            "\n"
            "GOOGLE_API_KEY=plain\n")
        monkeypatch.setattr(caller, "ENV_PATH", env_file)
        env = caller.load_env()
        assert env["ANTHROPIC_API_KEY"] == "sk-ant-spaced"
        assert env["OPENAI_API_KEY"] == "sk-quoted"
        assert env["GOOGLE_API_KEY"] == "plain"
