from app.agents.shared.prompts import ADVISOR_PROMPT
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm


class AdvisorNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=1200)
        self.memory_provider = memory_provider

    async def analyze_situation(self, state: AcademicState) -> AcademicState:
        # Step 1 & 2: retrieve + inject memory context
        past_chats = self.memory_provider.read_memory(
            state["user_id"], "past_chats", query=state["input"]
        )
        preferences = self.memory_provider.read_memory(
            state["user_id"], "preferences", query=state["input"]
        )
        state["memory_context"] = past_chats + preferences
        return state

    async def generate_guidance(self, state: AcademicState) -> AcademicState:
        # Step 3: prompt uses state["memory_context"]
        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."
        prompt = ADVISOR_PROMPT.format(user_input=state["input"], memory_context=memory_text)
        response = await self.llm.ainvoke(prompt)
        state["agent_output"] = response.content if hasattr(response, "content") else str(response)
        # Step 4: advisor-owned memory writes only
        self.memory_provider.write_memory(state["user_id"], "past_chats", state["agent_output"])
        self.memory_provider.write_memory(state["user_id"], "preferences", state["input"])
        state["memory_written"] = True
        return state
