"""Thin Gemini client — Google AI Studio FREE tier (Flash only). Never Vertex AI.

Every call degrades gracefully: if there's no key or the call fails, callers
fall back to deterministic rule-based output, so the app always works at $0.
"""
from .config import settings

_client = None
_tried = False


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
        _client = genai.Client(api_key=settings.gemini_api_key)
    except Exception:
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
    except Exception:
        return None
