#!/usr/bin/env python3
"""
llm_caller.py - Generic LLM Calling Infrastructure

This module provides a unified interface to call different LLM providers
(Anthropic Claude, Google Gemini) based on the router configuration.

Part of the Meeseeks RSI Toolkit.
"""

import json
import os
import httpx
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum

# Load configuration
CONFIG_PATH = Path(__file__).parent / "00_llm_router_config.json"
ENV_PATH = Path(__file__).parent / "API_CONFIG.env"


class Provider(Enum):
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
                    # Remove quotes if present
                    value = value.strip('"').strip("'")
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
        response.raise_for_status()
        data = response.json()
        
        # Extract text from content blocks
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
    
    # Build the request
    contents = []
    
    # Add system instruction if provided
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
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    with httpx.Client(timeout=300.0) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        
        # Extract text from candidates
        candidates = data.get('candidates', [])
        if candidates:
            parts = candidates[0].get('content', {}).get('parts', [])
            text_parts = [part['text'] for part in parts if 'text' in part]
            return '\n'.join(text_parts)
        return ""


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
        model: Model name from router config (e.g., "gemini-3.1-pro-preview", "claude-opus-4-6")
        prompt: The user prompt
        system: Optional system prompt
        max_tokens: Maximum output tokens (uses model default if not specified)
        temperature: Sampling temperature (0-1)
    
    Returns:
        The model's response text
    """
    config = get_model_config(model)
    
    if max_tokens is None:
        max_tokens = min(config.max_output_tokens, 8000)
    
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


# Convenience functions for common models
def call_gemini_pro(prompt: str, system: Optional[str] = None) -> str:
    """Call Gemini 3 Pro Preview (2M context) - best for large codebase analysis."""
    return call_model("gemini-3.1-pro-preview", prompt, system)


def call_gemini_flash(prompt: str, system: Optional[str] = None) -> str:
    """Call Gemini 3 Pro Preview - top tier model (flash deprecated)."""
    return call_model("gemini-3.1-pro-preview", prompt, system)


def call_claude_opus(prompt: str, system: Optional[str] = None) -> str:
    """Call Claude Opus 4.5 - best for creative/architecture decisions."""
    return call_model("claude-opus-4-6", prompt, system)


def call_claude_sonnet(prompt: str, system: Optional[str] = None) -> str:
    """Call Claude Opus 4.5 - top tier model (sonnet deprecated)."""
    return call_model("claude-opus-4-6", prompt, system)


if __name__ == "__main__":
    # Test the module
    print("Available models:", list_available_models())
    print("\nTesting Gemini Flash...")
    try:
        response = call_gemini_flash("Say 'MEESEEKS ONLINE!' in exactly those words.")
        print(f"Gemini response: {response}")
    except Exception as e:
        print(f"Gemini error: {e}")

