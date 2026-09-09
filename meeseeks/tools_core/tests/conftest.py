"""
Shared fixtures for the harness's own test suite.

Two rules these tests follow, and the reason the suite is trustworthy:

1. NO NETWORK. Every model call is stubbed. A test that needs a model states
   exactly what the model returns, including malformed and hostile output.
2. NO DEPENDENCE ON A REAL REPOSITORY. The probes read source, so the fixtures
   build a small repository in tmp_path. Tests that read a developer's actual
   checkout pass or fail for reasons that have nothing to do with the harness.
"""

import sys
from pathlib import Path

import pytest

TOOLS_CORE = Path(__file__).resolve().parents[1]
if str(TOOLS_CORE) not in sys.path:
    sys.path.insert(0, str(TOOLS_CORE))


DELIVERY_SRC = '''\
"""A stand-in for a module with retry logic, used by the probe tests."""

import smtplib
import socket
import time

SMTP_HOST = "smtp.example.com"
TRANSIENT_EXCEPTIONS = (socket.gaierror, TimeoutError, ConnectionError,
                        smtplib.SMTPServerDisconnected)
RETRY_ATTEMPTS = 3
RETRY_BACKOFF = (30, 60)


def send_email(subject, body):
    """Send with retries. Never surfaces the credential."""
    last_error = None
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            with smtplib.SMTP_SSL(SMTP_HOST) as server:
                server.login("user", "secret")
                server.send_message(body)
            return {"status": "sent", "attempts": attempt}
        except TRANSIENT_EXCEPTIONS as e:
            last_error = e
            if attempt < RETRY_ATTEMPTS:
                time.sleep(RETRY_BACKOFF[attempt - 1])
                continue
        except Exception as e:
            return {"status": "error", "error": type(e).__name__}
    return {"status": "error", "error": type(last_error).__name__}
'''

OTHER_SRC = '''\
def unrelated_helper(x):
    return x * 2
'''

SUITE_SRC = '''\
def test_a():
    assert True


def test_b():
    assert True
'''


@pytest.fixture
def repo(tmp_path):
    """A minimal repository the probes can actually read."""
    (tmp_path / "src").mkdir()
    (tmp_path / "tests").mkdir()
    (tmp_path / "src" / "delivery.py").write_text(DELIVERY_SRC)
    (tmp_path / "src" / "other.py").write_text(OTHER_SRC)
    (tmp_path / "tests" / "test_ok.py").write_text(SUITE_SRC)
    return tmp_path


@pytest.fixture
def ctx(repo):
    """Probe context pointing at the fixture repo."""
    return {"repo_root": str(repo), "timeout": 60}


@pytest.fixture
def executor():
    from probes.meeseeks_code_probe_executor import CodeProbeExecutor
    return CodeProbeExecutor()


@pytest.fixture
def probe():
    """Build a SynthesizedProbe of any type with any parameters."""
    from core.meeseeks_data_classes import SynthesizedProbe

    def _make(probe_type, dissent="a concern about send_email and its retries", **params):
        return SynthesizedProbe(
            name=f"p_{probe_type.value}_{abs(hash(str(params))) % 9999}",
            probe_type=probe_type, description="", code="",
            parameters=params, generated_by="test", from_dissent=dissent)
    return _make


@pytest.fixture
def stub_reader(monkeypatch):
    """Control what the code-reading model returns. Never touches the network."""
    import core.meeseeks_llm_caller as caller

    box = {"reply": ""}

    def fake_call(model, prompt, **kwargs):
        box["prompt"] = prompt
        return box["reply"]

    monkeypatch.setattr(caller, "call_model", fake_call)
    monkeypatch.setattr(caller, "get_default_model", lambda role: "stub-model")
    return box


@pytest.fixture
def stub_synth_model(monkeypatch):
    """Same, for the synthesizer, which binds call_model at import time."""
    import probes.meeseeks_llm_synthesizer as synth

    box = {"reply": ""}
    monkeypatch.setattr(synth, "call_model", lambda *a, **k: box["reply"])
    monkeypatch.setattr(synth, "get_default_model", lambda role: "stub-model")
    return box
