"""Backward-compatible AI facade.

The AI layer is now a multi-provider chain (Gemini → Groq → Cerebras) in
``app.llm``. These names are re-exported so existing imports keep working and
the fallback is transparent to every caller (routers, report). ``gemini_available``
now means "any provider available" — the UI never distinguishes providers.
"""
from .llm import available as gemini_available
from .llm import cache_clear, generate, generate_json

__all__ = ["generate", "generate_json", "gemini_available", "cache_clear"]
