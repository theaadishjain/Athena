from app.agents.shared.parsing import clean_flashcards, message_text, parse_json_array
from app.agents.shared.prompts import format_history
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm

FLASHCARD_PROMPT = """You are a study assistant. Based on the following input, \
generate exactly the number of flashcards requested (default 10 if not specified). \
Return ONLY a valid JSON array with no markdown, no code blocks, no preamble.
Format:
[
  {{"question": "...", "answer": "..."}},
  ...
]

{history}
Input:
{user_input}

Memory context:
{memory_context}"""

STRICT_PREFIX = (
    "Your previous reply was not valid JSON. "
    "Return EXACTLY AND ONLY a raw JSON array. No markdown, no commentary.\n\n"
)


class FlashcardNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=3500)
        self.memory_provider = memory_provider

    async def _generate(self, prompt: str) -> list[dict]:
        response = await self.llm.ainvoke(prompt)
        return clean_flashcards(parse_json_array(message_text(response)))

    async def generate_flashcards(self, state: AcademicState) -> AcademicState:
        # Step 1: Read input and memory context
        past_chats = await self.memory_provider.aread_memory(
            state["user_id"], "past_chats", query=state["input"]
        )
        preferences = await self.memory_provider.aread_memory(
            state["user_id"], "preferences", query=state["input"]
        )
        state["memory_context"] = past_chats + preferences
        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."

        prompt = FLASHCARD_PROMPT.format(
            user_input=state["input"],
            memory_context=memory_text,
            history=format_history(state.get("history")),
        )

        # Step 2: Call LLM. Fences / preamble are stripped by the parser, so
        # the paid retry only happens when the reply really is unusable.
        try:
            cards = await self._generate(prompt)
        except ValueError:
            cards = []
        if not cards:
            cards = await self._generate(STRICT_PREFIX + prompt)
        if not cards:
            raise ValueError("LLM returned no usable flashcards")

        state["flashcards"] = cards
        state["agent_output"] = f"Here are your {len(cards)} flashcards. Click any card to flip it."

        # Step 3: Write to memory
        await self.memory_provider.awrite_memory(
            state["user_id"],
            "past_chats",
            f"User requested flashcards: {state['input'][:200]}\nGenerated {len(cards)} flashcards.",
        )
        state["memory_written"] = True
        return state
