import openai
from langchain_core.runnables import Runnable
from langchain_openai import ChatOpenAI

from app.core.config import get_settings

# LLM calls carrying this tag have their tokens forwarded to the browser by
# /chat. Agents that return JSON (flashcards, quiz) must not use it.
STREAM_TO_USER_TAG = "stream_to_user"

# Free tiers answer bursts with 429 and overload with 503; the client retries
# those with backoff. With a backup model, switch to it at once instead: when
# a free daily quota is used up, retrying just waits out Google's retry-after
# delay (a planner request took 170s that way; the backup answers in ~2s).
MAX_RETRIES = 3
MAX_RETRIES_WITH_FALLBACK = 0

# Errors worth switching to the backup model for (busy or rate-limited);
# a bad key or a bad request would fail there too.
FALLBACK_ON = (openai.RateLimitError, openai.InternalServerError, openai.APITimeoutError)


def _chat_model(model: str, max_tokens: int, max_retries: int) -> ChatOpenAI:
    settings = get_settings()
    options: dict = {}
    if settings.uses_openrouter:
        # OpenRouter's app attribution headers; other providers don't need them.
        options["default_headers"] = {"HTTP-Referer": settings.app_url, "X-Title": "Athena AI"}
    if settings.resolved_reasoning_effort:
        options["reasoning_effort"] = settings.resolved_reasoning_effort
    return ChatOpenAI(
        model=model,
        # With no key the client refuses to start and every agent crashes;
        # a placeholder lets the call fail with 401, which users see as
        # "check LLM_API_KEY" instead of a generic error.
        api_key=settings.resolved_llm_api_key or "missing-key",
        base_url=settings.llm_base_url,
        max_tokens=max_tokens,
        max_retries=max_retries,
        **options,
    )


def _backup_for(model: str) -> str:
    """The model to switch to when `model` is busy: LLM_FALLBACK_MODEL, or the
    main model when `model` is something else (e.g. the document model)."""
    settings = get_settings()
    for candidate in (settings.llm_fallback_model, settings.llm_model):
        if candidate and candidate != model:
            return candidate
    return ""


def get_llm(max_tokens: int = 500, stream_to_user: bool = False, model: str | None = None) -> Runnable:
    """A chat model on the configured OpenAI-compatible endpoint (Google's
    Gemini API or OpenRouter), with a backup model when one is configured.
    `model` defaults to LLM_MODEL."""
    settings = get_settings()
    model = model or settings.llm_model
    fallback = _backup_for(model)
    if fallback:
        primary = _chat_model(model, max_tokens, MAX_RETRIES_WITH_FALLBACK)
        backup = _chat_model(fallback, max_tokens, MAX_RETRIES)
        llm: Runnable = primary.with_fallbacks([backup], exceptions_to_handle=FALLBACK_ON)
    else:
        llm = _chat_model(model, max_tokens, MAX_RETRIES)
    if stream_to_user:
        return llm.with_config(tags=[STREAM_TO_USER_TAG])
    return llm
