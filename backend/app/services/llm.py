from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import get_settings


def get_llm(max_tokens: int = 500) -> ChatGoogleGenerativeAI:
    settings = get_settings()
    return ChatGoogleGenerativeAI(
        model=settings.llm_model,
        google_api_key=settings.google_api_key,
        max_tokens=max_tokens,
        temperature=0.7
    )


class LLMService:
    def __init__(self) -> None:
        settings = get_settings()
        self._llm = ChatGoogleGenerativeAI(
            model=settings.llm_model,
            google_api_key=settings.google_api_key,
        )

    async def generate(self, prompt: str) -> str:
        response = await self._llm.ainvoke(prompt)
        return response.content if hasattr(response, "content") else str(response)
