"""Thin Gemini client — Google AI Studio FREE tier (Flash only). Never Vertex AI.

Hardened AI layer:
  * Responsible-AI **safety settings** on every call (configurable threshold).
  * **Generation config** — bounded temperature + max output tokens, so planning
    outputs are stable and can't run away in length/cost.
  * **Structured output** via ``generate_json`` (response_mime_type=JSON +
    response_schema) so decision endpoints get validated structure, not prose.
  * **In-process LRU cache** keyed by (model, system, prompt, schema) — identical
    prompts don't re-bill the 1,500/day free cap or pay the latency again.

Every call still degrades gracefully: no key, missing SDK, or any error returns
None (text) / None (json), and callers fall back to deterministic rule-based
output — the app always works at $0.
"""
import hashlib
import json
import logging
import threading
from collections import OrderedDict
from typing import Any

from .config import settings

log = logging.getLogger("climatwin.gemini")

_client = None
_tried = False
_safety = None  # lazily-built list[types.SafetySetting]

# Hard cap so a slow Gemini call can never hang a request worker.
_TIMEOUT_MS = 25_000

# The four standard harm categories we set an explicit threshold on.
_SAFETY_CATEGORIES = (
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
)


def gemini_available() -> bool:
    return bool(settings.gemini_api_key)


# --------------------------------------------------------------------------- #
# LRU response cache (thread-safe; sync endpoints run in FastAPI's threadpool)
# --------------------------------------------------------------------------- #
_cache: "OrderedDict[str, str]" = OrderedDict()
_cache_lock = threading.Lock()


def _cache_key(kind: str, system: str | None, prompt: str, schema: Any = None) -> str:
    raw = f"{settings.gemini_model}\x1f{kind}\x1f{system or ''}\x1f{prompt}\x1f{schema!r}"
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
    """Test/ops hook — drop all cached completions."""
    with _cache_lock:
        _cache.clear()


# --------------------------------------------------------------------------- #
# Client + config
# --------------------------------------------------------------------------- #
def _get_client():
    global _client, _tried
    if _tried:
        return _client
    _tried = True
    if not settings.gemini_api_key:
        return None
    try:
        from google import genai
        from google.genai import types
        _client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(timeout=_TIMEOUT_MS),
        )
    except Exception:
        log.exception("gemini client init failed — running with rule-based fallbacks")
        _client = None
    return _client


def _safety_settings(types) -> list | None:
    """Build (and memoise) the safety-settings list. ``off`` disables."""
    global _safety
    if settings.gemini_safety.strip().lower() == "off":
        return None
    if _safety is not None:
        return _safety
    try:
        threshold = getattr(types.HarmBlockThreshold, settings.gemini_safety)
        _safety = [
            types.SafetySetting(category=getattr(types.HarmCategory, cat), threshold=threshold)
            for cat in _SAFETY_CATEGORIES
        ]
    except Exception:
        log.warning("invalid gemini_safety=%r — proceeding without explicit thresholds", settings.gemini_safety)
        _safety = None
    return _safety


def _config(types, system: str | None, response_schema: Any = None):
    kwargs: dict[str, Any] = {
        "temperature": settings.gemini_temperature,
        "max_output_tokens": settings.gemini_max_output_tokens,
        "safety_settings": _safety_settings(types),
    }
    if system:
        kwargs["system_instruction"] = system
    if response_schema is not None:
        kwargs["response_mime_type"] = "application/json"
        kwargs["response_schema"] = response_schema
    return types.GenerateContentConfig(**{k: v for k, v in kwargs.items() if v is not None})


def _call(prompt: str, system: str | None, response_schema: Any = None) -> str | None:
    """Single Gemini text call with config + safety. None on any failure."""
    client = _get_client()
    if client is None:
        return None
    try:
        from google.genai import types
        resp = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=_config(types, system, response_schema),
        )
        return (resp.text or "").strip() or None
    except Exception as exc:
        log.warning("gemini call failed (%s) — using fallback", type(exc).__name__)
        return None


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
def generate(prompt: str, system: str | None = None) -> str | None:
    """Return Gemini text, or None on any failure (caller handles fallback)."""
    key = _cache_key("text", system, prompt)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    out = _call(prompt, system)
    if out:
        _cache_put(key, out)
    return out


def generate_json(prompt: str, response_schema: Any, system: str | None = None) -> Any | None:
    """Return parsed JSON (dict/list) from a schema-constrained call, else None.

    ``response_schema`` should be a ``google.genai.types.Schema``, a Pydantic
    model class, or another type the SDK accepts. On any failure (no key, SDK
    missing, invalid schema, unparseable output) this returns None so the caller
    falls back to its rule-based path.
    """
    key = _cache_key("json", system, prompt, response_schema)
    cached = _cache_get(key)
    if cached is not None:
        try:
            return json.loads(cached)
        except (ValueError, TypeError):
            return None
    text = _call(prompt, system, response_schema=response_schema)
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        log.warning("gemini_json: response was not valid JSON — using fallback")
        return None
    _cache_put(key, text)
    return parsed
