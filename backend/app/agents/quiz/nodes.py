import json
from app.agents.shared.state import AcademicState
from app.memory.provider import MemoryProvider
from app.services.llm import get_llm

QUIZ_PROMPT = """You are a study assistant. Based on the following input, generate exactly 5 multiple choice questions.
Return ONLY a valid JSON array with no markdown, no code blocks, no preamble. Format:
[
  {{
    "question": "...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "correct": "A",
    "explanation": "Brief explanation of why this is correct"
  }}
]

Input:
{user_input}

Memory context:
{memory_context}"""


class QuizNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=2000)
        self.memory_provider = memory_provider

    async def generate_quiz(self, state: AcademicState) -> AcademicState:
        # Step 1 & 2: retrieve + inject memory context
        past_chats = self.memory_provider.read_memory(
            state["user_id"], "past_chats", query=state["input"]
        )
        preferences = self.memory_provider.read_memory(
            state["user_id"], "preferences", query=state["input"]
        )
        state["memory_context"] = past_chats + preferences

        memory_text = "\n".join(state["memory_context"]) if state["memory_context"] else "No memory found."
        prompt = QUIZ_PROMPT.format(
            user_input=state["input"],
            memory_context=memory_text,
        )

        # Step 3: call LLM
        response = await self.llm.ainvoke(prompt)
        response_text = response.content if hasattr(response, "content") else str(response)

        # Step 4: parse JSON, retry if failed
        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError:
            strict_prompt = (
                "You failed to output ONLY JSON. Try again. "
                "YOU MUST RETURN EXACTLY AND ONLY A RAW JSON ARRAY. NO MARKDOWN:\n"
                + prompt
            )
            response = await self.llm.ainvoke(strict_prompt)
            response_text = response.content if hasattr(response, "content") else str(response)
            response_text = response_text.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(response_text)  # bubbles up to executor if still broken

        if not isinstance(parsed, list):
            raise ValueError(f"Expected a JSON array from LLM, got: {type(parsed).__name__}")

        state["agent_output"] = json.dumps(parsed)

        # Step 5: write memory
        self.memory_provider.write_memory(
            state["user_id"],
            "past_chats",
            f"User requested a quiz on: {state['input']}\nGenerated {len(parsed)} questions.",
        )
        state["memory_written"] = True

        return state
