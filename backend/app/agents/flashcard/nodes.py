import json
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm


class FlashcardNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=1500)
        self.memory_provider = memory_provider

    async def generate_flashcards(self, state: AcademicState) -> AcademicState:
        # Step 1: Read input and memory context
        past_chats = self.memory_provider.read_memory(
            state["user_id"], "past_chats", query=state["input"]
        )
        preferences = self.memory_provider.read_memory(
            state["user_id"], "preferences", query=state["input"]
        )
        state["memory_context"] = past_chats + preferences
        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."

        # Step 2: Call LLM
        prompt = f"""You are a study assistant. Based on the following input, 
generate exactly 10 flashcards. Return ONLY a valid JSON 
array with no markdown, no code blocks, no preamble.
Format:
[
  {{"question": "...", "answer": "..."}},
  ...
]

Input:
{state["input"]}

Memory context:
{memory_text}"""

        response = await self.llm.ainvoke(prompt)
        response_text = response.content if hasattr(response, "content") else str(response)

        # Step 3: Parse JSON, retry if failed
        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError:
            # Retry with stricter prompt
            strict_prompt = f"""You failed to output ONLY JSON. Try again. YOU MUST RETURN EXACTLY AND ONLY A RAW JSON ARRAY. NO MARKDOWN:
{prompt}"""
            response = await self.llm.ainvoke(strict_prompt)
            response_text = response.content if hasattr(response, "content") else str(response)
            
            # Remove any possible markdown blocks if it still failed
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(response_text) # If this fails, it bubbles up to executor.py

        # Ensure we save exactly the stringified JSON
        if isinstance(parsed, list):
            state["agent_output"] = json.dumps(parsed)
            card_count = len(parsed)
        else:
            # LLM returned valid JSON but not an array — treat as failure
            raise ValueError(f"Expected a JSON array from LLM, got: {type(parsed).__name__}")

        # Step 4: Write to memory
        self.memory_provider.write_memory(state["user_id"], "past_chats", f"User requested flashcards: {state['input']}\nGenerated {card_count} flashcards.")
        state["memory_written"] = True

        return state
