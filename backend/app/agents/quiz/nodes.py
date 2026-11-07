from app.agents.shared.parsing import clean_quiz, message_text, parse_json_array
from app.agents.shared.prompts import format_history
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
"correct" must be the letter of the right option.

The student's weak areas, from quizzes they got wrong and notes they found hard:
{weak_areas}

How to use the weak areas:
- If the input names a topic, quiz that topic, and aim at least 2 questions at related weak areas (especially the concepts behind questions they missed) when there are any.
- If the input asks to be quizzed on what they're weak at, or names no topic, build every question from the weak areas above.
- If there are no weak areas and no topic, quiz them on their recent topics from the memory context.
- Never repeat a missed question word for word; test the same idea a different way.

{history}
Input:
{user_input}

Memory context:
{memory_context}"""

STRICT_PREFIX = (
    "Your previous reply was not valid JSON. "
    "Return EXACTLY AND ONLY a raw JSON array. No markdown, no commentary.\n\n"
)

WEAK_AREAS_K = 5


class QuizNodes:
    def __init__(self, memory_provider: MemoryProvider) -> None:
        self.llm = get_llm(max_tokens=2000)
        self.memory_provider = memory_provider

    async def _generate(self, prompt: str) -> list[dict]:
        response = await self.llm.ainvoke(prompt)
        return clean_quiz(parse_json_array(message_text(response)))

    async def generate_quiz(self, state: AcademicState) -> AcademicState:
        # Step 1 & 2: retrieve + inject memory context, including weak areas
        past_chats = await self.memory_provider.aread_memory(
            state["user_id"], "past_chats", query=state["input"]
        )
        preferences = await self.memory_provider.aread_memory(
            state["user_id"], "preferences", query=state["input"]
        )
        weak_areas = await self.memory_provider.aread_memory(
            state["user_id"], "weak_subjects", query=state["input"], k=WEAK_AREAS_K
        )
        state["memory_context"] = past_chats + preferences + weak_areas
        memory_text = "\n".join(past_chats + preferences) or "No memory found."
        weak_text = "\n".join(f"- {w}" for w in weak_areas) or "None recorded yet."

        prompt = QUIZ_PROMPT.format(
            user_input=state["input"],
            memory_context=memory_text,
            weak_areas=weak_text,
            history=format_history(state.get("history")),
        )

        # Step 3: call LLM, retry once only if the reply is unusable
        try:
            questions = await self._generate(prompt)
        except ValueError:
            questions = []
        if not questions:
            questions = await self._generate(STRICT_PREFIX + prompt)
        if not questions:
            raise ValueError("LLM returned no usable quiz questions")

        state["quiz"] = questions
        state["agent_output"] = (
            f"Here are {len(questions)} practice questions. Select your answer for each one."
        )

        # Step 4: write memory
        await self.memory_provider.awrite_memory(
            state["user_id"],
            "past_chats",
            f"User requested a quiz on: {state['input'][:200]}\nGenerated {len(questions)} questions.",
        )
        state["memory_written"] = True
        return state
