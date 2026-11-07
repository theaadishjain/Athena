from app.agents.shared.memory_rules import extract_preference
from app.agents.shared.parsing import message_text
from app.agents.shared.prompts import PLANNER_PROMPT, format_history
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm


class PlannerNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=2000, stream_to_user=True)
        self.memory_provider = memory_provider

    async def calendar_analyzer(self, state: AcademicState) -> AcademicState:
        # Step 1 & 2: retrieve + inject memory context
        past_chats = await self.memory_provider.aread_memory(
            state["user_id"], "past_chats", query=state["input"]
        )
        preferences = await self.memory_provider.aread_memory(
            state["user_id"], "preferences", query=state["input"]
        )
        state["memory_context"] = past_chats + preferences
        return state

    async def task_analyzer(self, state: AcademicState) -> AcademicState:
        return state

    async def plan_generator(self, state: AcademicState) -> AcademicState:
        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."
        prompt = PLANNER_PROMPT.format(
            user_input=state["input"],
            memory_context=memory_text,
            history=format_history(state.get("history")),
        )
        response = await self.llm.ainvoke(prompt)
        state["agent_output"] = message_text(response)
        # Step 4: planner-owned memory writes only
        await self.memory_provider.awrite_memory(
            state["user_id"], "past_chats", f"Planned study for: {state['input'][:80]}"
        )
        preference = extract_preference(state["input"])
        if preference:
            await self.memory_provider.awrite_memory(state["user_id"], "preferences", preference)
        state["memory_written"] = True
        return state
