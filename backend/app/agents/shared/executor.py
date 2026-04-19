from app.agents.shared.state import AcademicState


class AgentExecutor:
    """Executes agent pipelines and merges outputs.

    Contract: This executor must never write memory.
    """

    async def run(self, state: AcademicState, agent_callable) -> AcademicState:
        try:
            updated = await agent_callable(state)
            
            if updated.get("intent") == "flashcard" and updated.get("agent_output"):
                import json
                try:
                    parsed = json.loads(updated["agent_output"])
                    if isinstance(parsed, list):
                        updated["flashcards"] = parsed
                        updated["agent_output"] = f"Here are your {len(parsed)} flashcards. Click any card to flip it."
                except Exception:
                    pass

            updated["error"] = None
            return updated
        except Exception as exc:  # pragma: no cover
            import traceback
            traceback.print_exc()
            state["error"] = str(exc)
            
            if state.get("intent") == "flashcard":
                state["agent_output"] = "Could not generate flashcards. Please try again."
            else:
                state["agent_output"] = "I hit an internal issue while processing your request."
                
            return state
