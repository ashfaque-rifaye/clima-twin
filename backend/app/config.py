"""Application settings, loaded from environment / .env.

Free-tier-first: Gemini via AI Studio API key (not Vertex AI).
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Gemini (Google AI Studio, free Flash tier)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"  # Flash only — never Pro (paid)

    # Google Maps Platform
    google_maps_api_key: str = ""

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
