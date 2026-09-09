#!/usr/bin/env python3
"""
llm_caller.py - Generic LLM Calling Infrastructure

This module provides a unified interface to call different LLM providers
(Anthropic Claude, Google Gemini, OpenAI) based on the router configuration.

Part of the Meeseeks RSI Toolkit.
"""

import json
import os
import types
import httpx
from functools import lru_cache
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
from dataclasses import dataclass
from enum import Enum

# Configuration paths - look in box/ directory
BOX_DIR = Path(__file__).parent.parent.parent / "box"
CONFIG_PATH = BOX_DIR / "00_llm_router_config.json"
ENV_PATH = BOX_DIR / "API_CONFIG.env"

# Fallback to tools_core root for backward compatibility
if not CONFIG_PATH.exists():
    CONFIG_PATH = Path(__file__).parent.parent / "00_llm_router_config.json"
if not ENV_PATH.exists():
    ENV_PATH = Path(__file__).parent.parent / "API_CONFIG.env"


class Provider(Enum):
    """Supported LLM providers"""
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OPENAI = "openai"


@dataclass
class ModelConfig:
    """Configuration for a specific model."""
    provider: Provider
    api_string: str
    display_name: str
    context_window: int
    max_output_tokens: int
    base_url: str
    auth_header: str
    auth_prefix: str


def load_env() -> Dict[str, str]:
    """Load API keys from the env file."""
    env = {}
    if ENV_PATH.exists():
        with open(ENV_PATH, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # Neither side was stripped: "KEY = v" stored the key as
                    # "KEY " (lookup misses, reported as "key not found") and
                    # the value with a leading space (401 from the provider).
                    key = key.strip()
                    if key.startswith("export "):
                        key = key[len("export "):].strip()
                    value = value.strip().strip('"').strip("'")
                    env[key] = value
    return env


def load_router_config() -> Dict[str, Any]:
    """Load the LLM router configuration."""
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)


def get_model_config(model_name: str) -> ModelConfig:
    """Get configuration for a specific model."""
    config = load_router_config()
    
    if model_name not in config['models']:
        raise ValueError(f"Unknown model: {model_name}. Available: {list(config['models'].keys())}")
    
    model = config['models'][model_name]
    provider_name = model['provider']
    provider_config = config['providers'][provider_name]
    
    return ModelConfig(
        provider=Provider(provider_name),
        api_string=model['api_string'],
        display_name=model['display_name'],
        context_window=model.get('context_window', 128000),
        max_output_tokens=model.get('max_output_tokens', 8000),
        base_url=provider_config['base_url'],
        auth_header=provider_config['auth_header'],
        auth_prefix=provider_config['auth_prefix'],
    )


def call_anthropic(
    model: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 8000,
    temperature: float = 0.7,
) -> str:
    """Call Anthropic Claude API."""
    env = load_env()
    api_key = env.get('ANTHROPIC_API_KEY')
    
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not found in API_CONFIG.env")
    
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    
    messages = [{"role": "user", "content": prompt}]
    
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
        "temperature": temperature,
    }
    
    if system:
        payload["system"] = system
    
    with httpx.Client(timeout=300.0) as client:
        response = client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload,
        )
        _raise_with_body(response, "anthropic", model)
        data = response.json()

        _record_usage(model, data)
        content = data.get('content', [])
        text_parts = [block['text'] for block in content if block['type'] == 'text']
        return '\n'.join(text_parts)


def call_google(
    model: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 8000,
    temperature: float = 0.7,
) -> str:
    """Call Google Gemini API."""
    env = load_env()
    api_key = env.get('GOOGLE_API_KEY')
    
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not found in API_CONFIG.env")
    
    contents = []
    
    if system:
        contents.append({
            "role": "user",
            "parts": [{"text": f"System: {system}\n\nUser: {prompt}"}]
        })
    else:
        contents.append({
            "role": "user", 
            "parts": [{"text": prompt}]
        })
    
    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
    }
    
    # The key goes in a header, never the URL. As a query parameter it lands in
    # every httpx log line, traceback and proxy record - verified leaking on
    # each request. Google's current docs use this header for both key formats.
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=300.0) as client:
        response = client.post(url, headers=headers, json=payload)
        _raise_with_body(response, "google", model)
        data = response.json()

        _record_usage(model, data)
        candidates = data.get('candidates', [])
        if candidates:
            parts = candidates[0].get('content', {}).get('parts', [])
            text_parts = [part['text'] for part in parts if 'text' in part]
            return '\n'.join(text_parts)
        return ""


def call_openai(
    model: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: int = 8000,
    temperature: float = 0.7,
) -> str:
    """Call OpenAI API."""
    env = load_env()
    api_key = env.get('OPENAI_API_KEY')
    
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in API_CONFIG.env")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    
    # GPT-5.x models use 'max_completion_tokens' instead of 'max_tokens'
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    
    if model.startswith("gpt-5") or model.startswith("o3") or model.startswith("o4"):
        payload["max_completion_tokens"] = max_tokens
    else:
        payload["max_tokens"] = max_tokens
    
    with httpx.Client(timeout=300.0) as client:
        response = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        # OpenAI serves its newer models (the codex line, and several GPT-5.x
        # variants) ONLY on /v1/responses. Asking for one on chat/completions
        # returns 404, which is indistinguishable from "no such model" unless
        # you list the account - the model is really there. Fall through rather
        # than making the caller pick an endpoint per model.
        if response.status_code == 404:
            return _call_openai_responses(client, headers, model, prompt, system, max_tokens)
        _raise_with_body(response, "openai", model)
        data = response.json()

        _record_usage(model, data)
        choices = data.get('choices', [])
        if choices:
            return choices[0].get('message', {}).get('content', '')
        return ""


def _extract_responses_text(data: Dict[str, Any]) -> str:
    """Pull the assistant text out of a /v1/responses body."""
    direct = data.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct
    parts: List[str] = []
    for item in data.get("output", []) or []:
        if not isinstance(item, dict):
            continue
        for block in item.get("content", []) or []:
            if isinstance(block, dict) and block.get("type") in ("output_text", "text"):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
    return "\n".join(parts)


def _call_openai_responses(client, headers, model, prompt, system, max_tokens) -> str:
    """The Responses API. Same contract as call_openai: text in, text out.

    Note there is no temperature here on purpose - the reasoning models reject
    any value other than the default, and this path exists mainly for them.
    """
    payload: Dict[str, Any] = {"model": model, "input": prompt}
    if system:
        payload["instructions"] = system
    # Minimum accepted is 16, and a reasoning model spends output tokens on
    # reasoning before it emits any text - a 5-token budget is an instant 400.
    payload["max_output_tokens"] = max(256, int(max_tokens or 0))
    response = client.post("https://api.openai.com/v1/responses",
                           headers=headers, json=payload)
    _raise_with_body(response, "openai(responses)", model)
    data = response.json()
    _record_usage(model, data)
    return _extract_responses_text(data)


# ---------------------------------------------------------------- accounting
#
# Every provider returns a usage block and this module used to throw all of them
# away, so a run's cost was unknowable. A tool you spend real money on should be
# able to tell you what a run cost.
_USAGE: List[Dict[str, Any]] = []


def _record_usage(model: str, data: Dict[str, Any]) -> None:
    u = data.get("usage") or data.get("usageMetadata") or {}
    if not isinstance(u, dict):
        return
    inp = (u.get("input_tokens") or u.get("prompt_tokens")
           or u.get("promptTokenCount") or 0)
    out = (u.get("output_tokens") or u.get("completion_tokens")
           or u.get("candidatesTokenCount") or 0)
    if not (inp or out):
        return
    _USAGE.append({"model": model, "input": int(inp), "output": int(out)})


def reset_usage() -> None:
    _USAGE.clear()


def usage_summary() -> Dict[str, Any]:
    """Tokens and dollars for everything called since the last reset."""
    try:
        models = load_router_config().get("models", {})
    except Exception:
        models = {}
    per: Dict[str, Dict[str, float]] = {}
    total_cost = 0.0
    for row in _USAGE:
        e = per.setdefault(row["model"], {"calls": 0, "input": 0, "output": 0, "cost": 0.0})
        e["calls"] += 1
        e["input"] += row["input"]
        e["output"] += row["output"]
        cost = models.get(row["model"], {}).get("cost", {}) or {}
        c = (row["input"] / 1e6) * float(cost.get("input_per_1m", 0) or 0) \
            + (row["output"] / 1e6) * float(cost.get("output_per_1m", 0) or 0)
        e["cost"] += c
        total_cost += c
    return {"calls": len(_USAGE), "by_model": per, "total_cost_usd": round(total_cost, 4)}


def _raise_with_body(response, provider: str, model: str) -> None:
    """raise_for_status(), but keep the provider's explanation.

    httpx's default message is the status line and a docs URL. The API almost
    always says exactly what is wrong in the body - "max_output_tokens must be
    greater than or equal to 16" - and throwing that away turns a one-line fix
    into a guessing game.
    """
    if response.status_code < 400:
        return
    try:
        body = response.json()
        detail = body.get("error", {}).get("message") or json.dumps(body)[:400]
    except Exception:
        detail = (response.text or "")[:400]
    raise RuntimeError(
        f"{provider} {model} -> HTTP {response.status_code}: {detail.strip()}")


def call_model(
    model: str,
    prompt: str,
    system: Optional[str] = None,
    max_tokens: Optional[int] = None,
    temperature: float = 0.7,
) -> str:
    """
    Universal model caller - routes to appropriate provider.
    
    Args:
        model: Model name from router config
        prompt: The user prompt
        system: Optional system prompt
        max_tokens: Maximum output tokens (uses model default if not specified)
        temperature: Sampling temperature (0-1)
    
    Returns:
        The model's response text
    """
    config = get_model_config(model)
    
    if max_tokens is None:
        max_tokens = config.max_output_tokens
    
    if config.provider == Provider.ANTHROPIC:
        return call_anthropic(
            model=config.api_string,
            prompt=prompt,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    elif config.provider == Provider.GOOGLE:
        return call_google(
            model=config.api_string,
            prompt=prompt,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    elif config.provider == Provider.OPENAI:
        return call_openai(
            model=config.api_string,
            prompt=prompt,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    else:
        raise ValueError(f"Unsupported provider: {config.provider}")


def list_available_models() -> List[str]:
    """List all available models from the router config."""
    config = load_router_config()
    return list(config['models'].keys())


def get_model_info(model: str) -> Dict[str, Any]:
    """Get detailed info about a model."""
    config = load_router_config()
    if model in config['models']:
        return config['models'][model]
    raise ValueError(f"Unknown model: {model}")


@lru_cache(maxsize=1)
def _load_model_roles() -> types.MappingProxyType:
    """Load and validate model_roles from the router config. Cached and immutable."""
    config = load_router_config()
    roles = config.get("model_roles", {})
    models = config.get("models", {})
    for role, value in roles.items():
        if role.startswith("_"):
            continue
        targets = value if isinstance(value, list) else [value]
        for t in targets:
            if t not in models:
                raise ValueError(f"model_roles['{role}'] references unknown model '{t}'")
    return types.MappingProxyType(roles)


def get_default_model(role: str) -> str:
    """Get the default model name for a role. Raises TypeError if the role maps to a list."""
    roles = _load_model_roles()
    if role not in roles:
        raise ValueError(f"Unknown model role: {role}. Available: {[k for k in roles if not k.startswith('_')]}")
    value = roles[role]
    if isinstance(value, list):
        raise TypeError(f"Role '{role}' is a list (use get_default_models()). Models: {value}")
    return value


def get_default_models(role: str) -> List[str]:
    """Get a list of models for a role. Wraps single strings into [string]."""
    roles = _load_model_roles()
    if role not in roles:
        raise ValueError(f"Unknown model role: {role}. Available: {[k for k in roles if not k.startswith('_')]}")
    value = roles[role]
    if isinstance(value, str):
        return [value]
    return list(value)


def invalidate_model_cache():
    """Clear the cached model roles. Call after modifying the router config at runtime."""
    _load_model_roles.cache_clear()


# Convenience functions — all resolve from model_roles in 00_llm_router_config.json
def call_gemini_pro(prompt: str, system: Optional[str] = None) -> str:
    """Call the top Google model (google_top role)."""
    return call_model(get_default_model("google_top"), prompt, system)


def call_gemini_flash(prompt: str, system: Optional[str] = None) -> str:
    """Call the fast Google model (google_fast role)."""
    return call_model(get_default_model("google_fast"), prompt, system)


def call_claude_opus(prompt: str, system: Optional[str] = None) -> str:
    """Call the top Anthropic model (anthropic_top role)."""
    return call_model(get_default_model("anthropic_top"), prompt, system)


def call_claude_sonnet(prompt: str, system: Optional[str] = None) -> str:
    """Call the balanced Anthropic model (anthropic_balanced role)."""
    return call_model(get_default_model("anthropic_balanced"), prompt, system)


if __name__ == "__main__":
    print("Available models:", list_available_models())
    print("\nTesting Gemini Pro...")
    try:
        response = call_gemini_pro("Say 'MEESEEKS ONLINE!' in exactly those words.")
        print(f"Gemini response: {response}")
    except Exception as e:
        print(f"Gemini error: {e}")
