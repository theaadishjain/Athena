from app.agents.shared.prompts import PLANNER_PROMPT
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm


class PlannerNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=600)
        self.memory_provider = memory_provider

    async def calendar_analyzer(self, state: AcademicState) -> AcademicState:
        # Step 1 & 2: retrieve + inject memory context
        past_chats = self.memory_provider.read_memory(
            state["user_id"], "past_chats", query=state["input"]
        )
        preferences = self.memory_provider.read_memory(
            state["user_id"], "preferences", query=state["input"]
        )
        state["memory_context"] = past_chats + preferences
        return state

    async def task_analyzer(self, state: AcademicState) -> AcademicState:
        return state

    async def plan_generator(self, state: AcademicState) -> AcademicState:
        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."
        prompt = PLANNER_PROMPT.format(user_input=state["input"], memory_context=memory_text)
        response = await self.llm.ainvoke(prompt)
        state["agent_output"] = response.content if hasattr(response, "content") else str(response)
        # Step 4: planner-owned memory writes only
        self.memory_provider.write_memory(state["user_id"], "past_chats", f"Planned study for: {state['input'][:80]}")
        
        input_lower = state["input"].lower()
        if "subject" in input_lower or "topic" in input_lower:
            self.memory_provider.write_memory(state["user_id"], "preferences", state["input"])
        state["memory_written"] = True
        return state
