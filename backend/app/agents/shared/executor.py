from app.agents.shared.state import AcademicState
import json
import traceback


class AgentExecutor:
    """Executes agent pipelines and merges outputs.

    Contract: This executor must never write memory.
    """

    async def run(self, state: AcademicState, agent_callable) -> AcademicState:
        try:
            updated = await agent_callable(state)

            if updated.get("intent") == "flashcard" and updated.get("agent_output"):
                try:
                    parsed = json.loads(updated["agent_output"])
                    if isinstance(parsed, list):
                        updated["flashcards"] = parsed
                        updated["agent_output"] = f"Here are your {len(parsed)} flashcards. Click any card to flip it."
                except Exception:
                    pass

            if updated.get("intent") == "quiz" and updated.get("agent_output"):
                try:
                    parsed = json.loads(updated["agent_output"])
                    if isinstance(parsed, list):
                        updated["quiz"] = parsed
                        updated["agent_output"] = "Here are 5 practice questions. Select your answer for each one."
                except Exception:
                    pass

            updated["error"] = None
            return updated
        except Exception as exc:  # pragma: no cover
            traceback.print_exc()
            state["error"] = str(exc)

            if state.get("intent") == "flashcard":
                state["agent_output"] = "Could not generate flashcards. Please try again."
            elif state.get("intent") == "quiz":
                state["agent_output"] = "Could not generate quiz questions. Please try again."
            else:
                state["agent_output"] = "I hit an internal issue while processing your request."

            return state
