from app.agents.shared.memory_rules import weak_subject_from_summary
from app.agents.shared.parsing import message_text
from app.agents.shared.prompts import SUMMARIZER_PROMPT, format_history
from app.agents.shared.state import AcademicState
from app.agents.summarizer.document import summarize_document
from app.core.config import get_settings
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm


class SummarizerNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=1500, stream_to_user=True)
        # Uploaded documents: short per-part notes, then a final summary that
        # streams to the browser on /summarize/stream (part notes never do).
        document_model = get_settings().document_model
        self.map_llm = get_llm(max_tokens=700, model=document_model)
        self.document_llm = get_llm(max_tokens=2500, stream_to_user=True, model=document_model)
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
        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."

        # Step 3: summarize. Uploaded documents are read in full and cited;
        # text typed into chat uses the streaming prompt.
        document = state.get("document")
        if document:
            state["agent_output"] = await summarize_document(
                document, memory_text, self.map_llm, self.document_llm
            )
        else:
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
