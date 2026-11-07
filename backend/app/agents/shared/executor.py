import logging

import openai

from app.agents.shared.state import AcademicState

logger = logging.getLogger(__name__)

FALLBACK_MESSAGES = {
    "flashcard": "Could not generate flashcards. Please try again.",
    "quiz": "Could not generate quiz questions. Please try again.",
}

RATE_LIMIT_MESSAGE = (
    "The AI model's usage limit was reached (free tiers allow only a few requests "
    "per minute and per day). Wait a minute and try again."
)
BUSY_MESSAGE = (
    "The AI model is overloaded right now (this happens on free tiers at busy times). "
    "Please try again in a minute."
)
AUTH_MESSAGE = (
    "The AI service rejected Athena's API key. Check LLM_API_KEY in backend/.env."
)


def failure_message(exc: Exception, intent: str | None) -> str:
    """A message the student can act on, based on why the model call failed."""
    if isinstance(exc, openai.RateLimitError) or getattr(exc, "status_code", None) == 429:
        return RATE_LIMIT_MESSAGE
    if isinstance(exc, (openai.InternalServerError, openai.APITimeoutError)):
        return BUSY_MESSAGE
    if isinstance(exc, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return AUTH_MESSAGE
    # Google's endpoint reports a bad key as 400 "Please pass a valid API key".
    if isinstance(exc, openai.BadRequestError) and "api key" in str(getattr(exc, "body", "")).lower():
        return AUTH_MESSAGE
    return FALLBACK_MESSAGES.get(intent, "I hit an internal issue while processing your request.")


class AgentExecutor:
    """Executes agent pipelines and turns failures into a friendly fallback.

    Contract: This executor must never write memory.
    """

    async def run(self, state: AcademicState, agent_callable) -> AcademicState:
        try:
            updated = await agent_callable(state)
            updated["error"] = None
            return updated
        except Exception as exc:
            logger.exception("Agent pipeline error")
            state["error"] = str(exc)
            state["agent_output"] = failure_message(exc, state.get("intent"))
            state.setdefault("memory_written", False)
            return state
