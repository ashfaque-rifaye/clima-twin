"""Thin Gemini client — Google AI Studio FREE tier (Flash only). Never Vertex AI.

Every call degrades gracefully: if there's no key or the call fails, callers
fall back to deterministic rule-based output, so the app always works at $0.
"""
import logging

from .config import settings

log = logging.getLogger("climatwin.gemini")

_client = None
_tried = False

# Hard cap so a slow Gemini call can never hang a request worker.
_TIMEOUT_MS = 25_000


def gemini_available() -> bool:
    return bool(settings.gemini_api_key)


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


def generate(prompt: str, system: str | None = None) -> str | None:
    """Return Gemini text, or None on any failure (caller handles fallback)."""
    client = _get_client()
    if client is None:
        return None
    try:
        contents = prompt if not system else f"{system}\n\n{prompt}"
        resp = client.models.generate_content(model=settings.gemini_model, contents=contents)
        return (resp.text or "").strip() or None
    except Exception as exc:
        log.warning("gemini generate failed (%s) — using fallback", type(exc).__name__)
        return None
