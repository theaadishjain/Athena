from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
