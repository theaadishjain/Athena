from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _split_csv(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    llm_model: str = Field(default="google/gemini-2.5-flash", alias="LLM_MODEL")
    # Any OpenAI-compatible endpoint. Defaults to OpenRouter; for a Google AI
    # Studio key use https://generativelanguage.googleapis.com/v1beta/openai/
    llm_base_url: str = Field(default=OPENROUTER_BASE_URL, alias="LLM_BASE_URL")
    # Backup model on the same endpoint, used when LLM_MODEL is overloaded or
    # rate-limited (common on free tiers). Empty = no backup.
    llm_fallback_model: str = Field(default="", alias="LLM_FALLBACK_MODEL")
    # Model for whole-document work (file summaries, file flashcards): long
    # input, structured output, so a faster model fits. Empty = LLM_MODEL.
    llm_document_model: str = Field(default="", alias="LLM_DOCUMENT_MODEL")
    # Key for LLM_BASE_URL. Falls back to OPENROUTER_API_KEY when empty.
    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    # "low" / "medium" / "high" for models that think before answering.
    # Empty = "low" on Google's endpoint (so thinking doesn't eat the
    # answer's token budget), provider default elsewhere.
    llm_reasoning_effort: str = Field(default="", alias="LLM_REASONING_EFFORT")
    # Parallel model calls when one request is split into parts (long PDFs).
    # Keep it low on free tiers, which limit requests per minute.
    llm_max_concurrency: int = Field(default=3, ge=1, le=16, alias="LLM_MAX_CONCURRENCY")
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
    def document_model(self) -> str:
        return self.llm_document_model or self.llm_model

    @property
    def uses_google(self) -> bool:
        return "generativelanguage.googleapis.com" in self.llm_base_url

    @property
    def uses_openrouter(self) -> bool:
        return "openrouter.ai" in self.llm_base_url

    @property
    def resolved_llm_api_key(self) -> str:
        if self.llm_api_key:
            return self.llm_api_key
        # An OpenRouter key is only valid on OpenRouter.
        return self.openrouter_api_key if self.uses_openrouter else ""

    @property
    def resolved_reasoning_effort(self) -> str | None:
        if self.llm_reasoning_effort:
            return self.llm_reasoning_effort
        return "low" if self.uses_google else None

    @property
    def cors_origin_list(self) -> List[str]:
        return _split_csv(self.cors_origins)

    @property
    def authorized_party_list(self) -> List[str]:
        return _split_csv(self.clerk_authorized_parties) or self.cors_origin_list


@lru_cache
def get_settings() -> Settings:
    return Settings()
