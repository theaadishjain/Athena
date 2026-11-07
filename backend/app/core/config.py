from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split_csv(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    llm_model: str = Field(default="google/gemini-2.5-flash", alias="LLM_MODEL")
    mempalace_path: str = Field(default="~/.mempalace/palace", alias="MEMPALACE_PATH")
    mempalace_collection: str = Field(default="studyco", alias="MEMPALACE_COLLECTION")
    memory_top_k: int = Field(default=3, alias="MEMORY_TOP_K")
    cors_origins: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")
    database_url: str = Field(default="sqlite+aiosqlite:///./studyco.db", alias="DATABASE_URL")
    clerk_secret_key: str = Field(default="", alias="CLERK_SECRET_KEY")
    # Optional: your Clerk Frontend API URL (e.g. https://your-app.clerk.accounts.dev).
    # When set, the token's `iss` claim must match it exactly.
    clerk_issuer: str = Field(default="", alias="CLERK_ISSUER")
    # Origins allowed in the token's `azp` claim. Defaults to CORS_ORIGINS.
    clerk_authorized_parties: str = Field(default="", alias="CLERK_AUTHORIZED_PARTIES")
    app_url: str = Field(default="http://localhost:3000", alias="APP_URL")
    max_upload_mb: int = Field(default=10, alias="MAX_UPLOAD_MB")
    chat_history_messages: int = Field(default=10, alias="CHAT_HISTORY_MESSAGES")

    @property
    def cors_origin_list(self) -> List[str]:
        return _split_csv(self.cors_origins)

    @property
    def authorized_party_list(self) -> List[str]:
        return _split_csv(self.clerk_authorized_parties) or self.cors_origin_list


@lru_cache
def get_settings() -> Settings:
    return Settings()
