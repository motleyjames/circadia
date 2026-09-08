"""Tests for configuration module."""

import os
from pathlib import Path
from unittest.mock import patch

import pytest


def test_settings_default_values():
    """Test that settings have sensible defaults."""
    from gen_media.config import Settings

    with patch.dict(os.environ, {}, clear=True):
        settings = Settings()

    assert settings.comfyui_url == "http://127.0.0.1:8188"
    assert settings.drawthings_url == "http://127.0.0.1:7860"
    assert settings.default_width == 1024
    assert settings.default_height == 768
    assert settings.default_steps == 4
    assert settings.default_backend == "comfyui"


def test_settings_from_env():
    """Test that settings can be loaded from environment."""
    from gen_media.config import Settings

    env = {
        "COMFYUI_URL": "http://localhost:9999",
        "DEFAULT_WIDTH": "512",
        "DEFAULT_HEIGHT": "512",
    }

    with patch.dict(os.environ, env, clear=True):
        settings = Settings()

    assert settings.comfyui_url == "http://localhost:9999"
    assert settings.default_width == 512
    assert settings.default_height == 512


def test_settings_path_expansion():
    """Test that paths are expanded correctly."""
    from gen_media.config import Settings

    with patch.dict(os.environ, {"COMFYUI_PATH": "~/ComfyUI"}, clear=True):
        settings = Settings()

    assert settings.comfyui_path == Path.home() / "ComfyUI"


def test_resolved_models_path():
    """Test that models path resolves correctly."""
    from gen_media.config import Settings

    with patch.dict(os.environ, {}, clear=True):
        settings = Settings()

    assert settings.resolved_models_path == settings.comfyui_path / "models"


def test_resolved_models_path_override():
    """Test that models path can be overridden."""
    from gen_media.config import Settings

    env = {"MODELS_PATH": "/custom/models"}

    with patch.dict(os.environ, env, clear=True):
        settings = Settings()

    assert settings.resolved_models_path == Path("/custom/models")


def test_get_settings_cached():
    """Test that get_settings returns cached instance."""
    from gen_media.config import get_settings

    get_settings.cache_clear()

    settings1 = get_settings()
    settings2 = get_settings()

    assert settings1 is settings2

