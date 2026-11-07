from app.agents.shared.memory_rules import weak_subject_from_summary
from app.agents.shared.parsing import message_text
from app.agents.shared.prompts import SUMMARIZER_PROMPT, format_history
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm


class SummarizerNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=1500, stream_to_user=True)
        self.memory_provider = memory_provider

    async def summarize(self, state: AcademicState) -> AcademicState:
        # Step 1 & 2: retrieve + inject memory context
        note_summaries = await self.memory_provider.aread_memory(
            state["user_id"], "note_summaries", query=state["input"]
        )
        weak_subjects = await self.memory_provider.aread_memory(
            state["user_id"], "weak_subjects", query=state["input"]
        )
        state["memory_context"] = note_summaries + weak_subjects
        # Step 3: prompt uses state["memory_context"]
        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."
        prompt = SUMMARIZER_PROMPT.format(
            user_input=state["input"],
            memory_context=memory_text,
            history=format_history(state.get("history")),
        )
        response = await self.llm.ainvoke(prompt)
        state["agent_output"] = message_text(response)
        # Step 4: summarizer-owned memory writes only
        await self.memory_provider.awrite_memory(
            state["user_id"], "note_summaries", state["agent_output"][:200]
        )
        weak_subject = weak_subject_from_summary(state["agent_output"], state["input"])
        if weak_subject:
            await self.memory_provider.awrite_memory(state["user_id"], "weak_subjects", weak_subject)
        state["memory_written"] = True
        return state
