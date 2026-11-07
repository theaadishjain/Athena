import logging

from app.agents.shared.state import AcademicState

logger = logging.getLogger(__name__)

FALLBACK_MESSAGES = {
    "flashcard": "Could not generate flashcards. Please try again.",
    "quiz": "Could not generate quiz questions. Please try again.",
}


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
            state["agent_output"] = FALLBACK_MESSAGES.get(
                state.get("intent"), "I hit an internal issue while processing your request."
            )
            state.setdefault("memory_written", False)
            return state
