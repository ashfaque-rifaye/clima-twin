"""Google Gemini provider — AI Studio FREE tier (Flash only). Never Vertex AI.

Carries the Responsible-AI safety settings, bounded generation config, and
schema-constrained structured output. Any failure returns None so the chain
falls through to the next provider.
"""
from __future__ import annotations

import logging
from typing import Any

from ..config import settings
from .base import LLMProvider

log = logging.getLogger("climatwin.llm.gemini")

_TIMEOUT_MS = 25_000
_SAFETY_CATEGORIES = (
    "HARM_CATEGORY_HARASSMENT",
    "HARM_CATEGORY_HATE_SPEECH",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "HARM_CATEGORY_DANGEROUS_CONTENT",
)


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self) -> None:
        self._client = None
        self._tried = False
        self._safety: list | None = None

    def available(self) -> bool:
        return bool(settings.gemini_api_key)

    def _get_client(self):
        if self._tried:
            return self._client
        self._tried = True
        if not settings.gemini_api_key:
            return None
        try:
            from google import genai
            from google.genai import types
            self._client = genai.Client(
                api_key=settings.gemini_api_key,
                http_options=types.HttpOptions(timeout=_TIMEOUT_MS),
            )
        except Exception:
            log.exception("gemini client init failed")
            self._client = None
        return self._client

    def _safety_settings(self, types) -> list | None:
        if settings.gemini_safety.strip().lower() == "off":
            return None
        if self._safety is not None:
            return self._safety
        try:
            threshold = getattr(types.HarmBlockThreshold, settings.gemini_safety)
            self._safety = [
                types.SafetySetting(category=getattr(types.HarmCategory, cat), threshold=threshold)
                for cat in _SAFETY_CATEGORIES
            ]
        except Exception:
            log.warning("invalid gemini_safety=%r — proceeding without thresholds", settings.gemini_safety)
            self._safety = None
        return self._safety

    def _config(self, types, system: str | None, response_schema: Any):
        kwargs: dict[str, Any] = {
            "temperature": settings.gemini_temperature,
            "max_output_tokens": settings.gemini_max_output_tokens,
            "safety_settings": self._safety_settings(types),
        }
        if system:
            kwargs["system_instruction"] = system
        if response_schema is not None:
            kwargs["response_mime_type"] = "application/json"
            kwargs["response_schema"] = response_schema
        return types.GenerateContentConfig(**{k: v for k, v in kwargs.items() if v is not None})

    def complete(self, prompt: str, system: str | None = None, *, json_schema: Any = None) -> str | None:
        client = self._get_client()
        if client is None:
            return None
        try:
            from google.genai import types
            resp = client.models.generate_content(
                model=settings.gemini_model,
                contents=prompt,
                config=self._config(types, system, json_schema),
            )
            return (resp.text or "").strip() or None
        except Exception as exc:
            log.warning("gemini call failed (%s)", type(exc).__name__)
            return None
