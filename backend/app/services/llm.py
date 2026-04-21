from langchain_openai import ChatOpenAI
from app.core.config import get_settings

def get_llm(max_tokens: int = 500) -> ChatOpenAI:
    settings = get_settings()
    return ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        max_tokens=max_tokens,
        default_headers={
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Athena AI"
        }
    )
