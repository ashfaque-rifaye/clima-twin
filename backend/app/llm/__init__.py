"""Multi-provider AI orchestrator.

Tries providers in order — Gemini (primary) → Groq → Cerebras — falling through
on any failure (error, rate limit, unparseable output). The fallback is entirely
internal: callers get provider-agnostic text/JSON and the UI never names Groq or
Cerebras. An in-process LRU cache keys on the prompt (not the provider), so a
repeated prompt is answered once regardless of which provider served it.

Public API is intentionally the same shape the app has always used:
``available()``, ``generate()``, ``generate_json()``, ``cache_clear()``.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
from collections import OrderedDict
from typing import Any

from ..config import settings
from .base import LLMProvider
from .gemini_provider import GeminiProvider
from .openai_compat import OpenAICompatProvider

log = logging.getLogger("climatwin.llm")

_GROQ_URL = "https://api.groq.com/openai/v1"
_CEREBRAS_URL = "https://api.cerebras.ai/v1"


def _build_providers() -> list[LLMProvider]:
    """Ordered provider chain built from settings. Gemini stays primary; the
    OpenAI-compatible fallbacks are appended only when configured."""
    providers: list[LLMProvider] = [GeminiProvider()]
    groq_keys = [settings.groq_api_key, settings.groq_api_key2]
    if any(groq_keys):
        providers.append(OpenAICompatProvider("groq", _GROQ_URL, groq_keys, settings.groq_model))
    if settings.cerebras_api_key:
        providers.append(OpenAICompatProvider("cerebras", _CEREBRAS_URL, [settings.cerebras_api_key], settings.cerebras_model))
    return providers


PROVIDERS: list[LLMProvider] = _build_providers()


# --------------------------------------------------------------------------- #
# LRU response cache (thread-safe; sync endpoints run in FastAPI's threadpool)
# --------------------------------------------------------------------------- #
_cache: "OrderedDict[str, str]" = OrderedDict()
_cache_lock = threading.Lock()


def _cache_key(kind: str, system: str | None, prompt: str, schema: Any = None) -> str:
    raw = f"{kind}\x1f{system or ''}\x1f{prompt}\x1f{schema!r}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> str | None:
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    return None


def _cache_put(key: str, value: str) -> None:
    cap = max(0, settings.gemini_cache_size)
    if cap == 0:
        return
    with _cache_lock:
        _cache[key] = value
        _cache.move_to_end(key)
        while len(_cache) > cap:
            _cache.popitem(last=False)


def cache_clear() -> None:
    with _cache_lock:
        _cache.clear()


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def available() -> bool:
    """True when at least one provider is configured."""
    return any(p.available() for p in PROVIDERS)


def _first_completion(prompt: str, system: str | None, json_schema: Any) -> tuple[str | None, LLMProvider | None]:
    for provider in PROVIDERS:
        if not provider.available():
            continue
        try:
            out = provider.complete(prompt, system, json_schema=json_schema)
        except Exception:
            log.warning("provider %s raised — falling through", provider.name)
            out = None
        if out:
            return out, provider
    return None, None


def generate(prompt: str, system: str | None = None) -> str | None:
    """Provider-agnostic text completion, or None if every provider failed."""
    key = _cache_key("text", system, prompt)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    out, provider = _first_completion(prompt, system, None)
    if out and provider is not None:
        _cache_put(key, out)
        if provider is not PROVIDERS[0]:
            log.info("AI served by fallback provider: %s", provider.name)
    return out


def generate_json(prompt: str, response_schema: Any, system: str | None = None) -> Any | None:
    """Provider-agnostic JSON completion. Falls through to the next provider when
    a provider returns unparseable JSON."""
    key = _cache_key("json", system, prompt, response_schema)
    cached = _cache_get(key)
    if cached is not None:
        try:
            return json.loads(cached)
        except (ValueError, TypeError):
            return None
    for provider in PROVIDERS:
        if not provider.available():
            continue
        try:
            text = provider.complete(prompt, system, json_schema=response_schema)
        except Exception:
            log.warning("provider %s raised — falling through", provider.name)
            text = None
        if not text:
            continue
        try:
            parsed = json.loads(text)
        except (ValueError, TypeError):
            log.warning("provider %s returned non-JSON — trying next", provider.name)
            continue
        _cache_put(key, text)
        if provider is not PROVIDERS[0]:
            log.info("AI (json) served by fallback provider: %s", provider.name)
        return parsed
    return None


__all__ = ["available", "generate", "generate_json", "cache_clear", "PROVIDERS"]
