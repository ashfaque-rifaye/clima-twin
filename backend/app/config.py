"""Application settings, loaded from environment / .env.

Free-tier-first: Gemini via AI Studio API key (not Vertex AI).
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV = Path(__file__).resolve().parent.parent / ".env"  # backend/.env, regardless of CWD


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV, extra="ignore")

    # Gemini (Google AI Studio, free Flash tier)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"  # Flash only — never Pro (paid)
    # Generation controls (deterministic-leaning for planning outputs)
    gemini_temperature: float = 0.4
    # Headroom for gemini-2.5-flash "thinking" tokens + a full structured report
    # narrative; it is a cap, so short generations are unaffected.
    gemini_max_output_tokens: int = 4096
    # In-process LRU for identical prompts — protects the free-tier daily cap
    # and cuts latency on repeat /proposal / /recommend calls.
    gemini_cache_size: int = 256
    # Responsible-AI: block medium+ harmful content. "off" disables (not advised).
    gemini_safety: str = "BLOCK_MEDIUM_AND_ABOVE"

    # Fallback AI providers — used automatically when Gemini errors or rate-limits.
    # Internal only: never surfaced in the UI. OpenAI-compatible chat completions.
    groq_api_key: str = ""
    groq_api_key2: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    cerebras_api_key: str = ""
    # This key's account exposes gemma-4-31b / zai-glm-4.7 / gpt-oss-120b (not
    # llama-3.3-70b). gemma-4-31b is the reliable non-reasoning instruct model.
    cerebras_model: str = "gemma-4-31b"

    # Google Maps Platform (browser key, referrer-restricted)
    google_maps_api_key: str = ""
    # Server-side key (API-restricted) for Weather + Air Quality REST calls
    server_api_key: str = ""

    # Google Cloud / BigQuery
    gcp_project: str = ""
    bq_dataset: str = "climatwin"
    bq_location: str = "asia-south1"
    bq_grid_table: str = "grid_cells"
    bq_ee_table: str = "grid_ee"  # Earth Engine export (LST/NDVI/NDBI/DEM)
    # Where the base analysis grid comes from:
    #   auto        -> try BigQuery, fall back to the synthetic grid on any failure
    #   bigquery    -> require BigQuery (still falls back so the app never crashes)
    #   ee_enriched -> BigQuery grid enriched with real Earth Engine LST/NDVI/DEM
    #                  (hybrid: real satellite where available, synthetic in gaps)
    #   synthetic   -> always use the in-code urban-form grid (no cloud calls)
    grid_source: str = "auto"

    # Scenario persistence: auto (Firestore if reachable, else memory) | firestore | in-memory
    scenario_store: str = "auto"
    firestore_collection: str = "scenarios"

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Ops
    rate_limit_per_minute: int = 240  # generous for a live demo, blocks abuse
    log_level: str = "INFO"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
