from langchain_core.runnables import Runnable
from langchain_openai import ChatOpenAI

from app.core.config import get_settings

# LLM calls carrying this tag have their tokens forwarded to the browser by
# /chat. Agents that return JSON (flashcards, quiz) must not use it.
STREAM_TO_USER_TAG = "stream_to_user"


def get_llm(max_tokens: int = 500, stream_to_user: bool = False) -> Runnable:
    settings = get_settings()
    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        max_tokens=max_tokens,
        default_headers={
            "HTTP-Referer": settings.app_url,
            "X-Title": "Athena AI",
        },
    )
    if stream_to_user:
        return llm.with_config(tags=[STREAM_TO_USER_TAG])
    return llm
