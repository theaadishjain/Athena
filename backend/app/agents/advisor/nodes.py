import re

from app.agents.shared.memory_rules import extract_preference
from app.agents.shared.parsing import message_text
from app.agents.shared.prompts import ADVISOR_PROMPT, format_history
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm

# The prompt describes BRIEF/DETAILED modes and models sometimes echo the label.
MODE_LABEL_RE = re.compile(r"^\s*\**(BRIEF|DETAILED)\s+mode\**\s*:?\**\s*", re.IGNORECASE)


def strip_mode_label(text: str) -> str:
    return MODE_LABEL_RE.sub("", text, count=1)


class AdvisorNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=1200, stream_to_user=True)
        self.memory_provider = memory_provider

    async def analyze_situation(self, state: AcademicState) -> AcademicState:
        # Step 1 & 2: retrieve + inject memory context
        past_chats = await self.memory_provider.aread_memory(
            state["user_id"], "past_chats", query=state["input"]
        )
        preferences = await self.memory_provider.aread_memory(
            state["user_id"], "preferences", query=state["input"]
        )
        state["memory_context"] = past_chats + preferences
        return state

    async def generate_guidance(self, state: AcademicState) -> AcademicState:
        # Step 3: prompt uses state["memory_context"] and the chat history
        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."
        prompt = ADVISOR_PROMPT.format(
            user_input=state["input"],
            memory_context=memory_text,
            history=format_history(state.get("history")),
        )
        response = await self.llm.ainvoke(prompt)
        state["agent_output"] = strip_mode_label(message_text(response)).strip()

        # Step 4: advisor-owned memory writes only
        await self.memory_provider.awrite_memory(
            state["user_id"], "past_chats", f"Topic: {state['input'][:100]}"
        )
        preference = extract_preference(state["input"])
        if preference:
            await self.memory_provider.awrite_memory(state["user_id"], "preferences", preference)
        state["memory_written"] = True
        return state
