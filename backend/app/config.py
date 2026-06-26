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

    # Google Maps Platform (browser key, referrer-restricted)
    google_maps_api_key: str = ""
    # Server-side key (API-restricted) for Weather + Air Quality REST calls
    server_api_key: str = ""

    # Google Cloud / BigQuery
    gcp_project: str = ""
    bq_dataset: str = "climatwin"
    bq_location: str = "asia-south1"

    # CORS
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
