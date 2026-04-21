from app.agents.shared.prompts import SUMMARIZER_PROMPT
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm


class SummarizerNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=800)
        self.memory_provider = memory_provider

    async def summarize(self, state: AcademicState) -> AcademicState:
        # Step 1 & 2: retrieve + inject memory context
        note_summaries = self.memory_provider.read_memory(
            state["user_id"], "note_summaries", query=state["input"]
        )
        weak_subjects = self.memory_provider.read_memory(
            state["user_id"], "weak_subjects", query=state["input"]
        )
        state["memory_context"] = note_summaries + weak_subjects
        # Step 3: prompt uses state["memory_context"]
        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."
        prompt = SUMMARIZER_PROMPT.format(user_input=state["input"], memory_context=memory_text)
        response = await self.llm.ainvoke(prompt)
        state["agent_output"] = response.content if hasattr(response, "content") else str(response)
        # Step 4: summarizer-owned memory writes only
        self.memory_provider.write_memory(state["user_id"], "note_summaries", state["agent_output"])
        self.memory_provider.write_memory(state["user_id"], "weak_subjects", state["input"])
        state["memory_written"] = True
        return state
