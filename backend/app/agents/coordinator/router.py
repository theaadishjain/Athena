"""Rule-based intent detection.

Order matters: explicit slash commands win, then the structured-output agents
(quiz, flashcards, summary), then planning, and everything else goes to the
advisor. Patterns use word boundaries so "plan" doesn't match "planet" and
"exam" alone doesn't drag explanations into the planner.
"""
import re

from app.agents.shared.state import IntentType

SLASH_COMMANDS: dict[str, IntentType] = {
    "/plan": "planner",
    "/schedule": "planner",
    "/summarize": "summarizer",
    "/summarise": "summarizer",
    "/summary": "summarizer",
    "/flashcards": "flashcard",
    "/flashcard": "flashcard",
    "/cards": "flashcard",
    "/quiz": "quiz",
    "/mcq": "quiz",
    "/explain": "advisor",
    "/solve": "advisor",
}


def _rx(*patterns: str) -> re.Pattern:
    return re.compile("|".join(rf"\b{p}\b" for p in patterns), re.IGNORECASE)


QUIZ_RE = _rx(
    r"quiz(?:zes)?", r"quiz me", r"test me", r"mcqs?", r"multiple[- ]choice",
    r"practice (?:questions|test|exam)", r"test questions",
)
FLASHCARD_RE = _rx(
    r"flash ?cards?", r"(?:make|create|generate) (?:\d+ )?cards", r"memori[sz]e", r"drill me",
)
SUMMARY_RE = _rx(r"summari[sz]e", r"summary", r"tl;?dr", r"key points of")

# Clear planning vocabulary.
PLAN_RE = _rx(
    r"plan", r"planning", r"schedule", r"timetable", r"calendar", r"deadlines?",
    r"study plan", r"revision plan", r"prepare for",
)
# "exam"/"test" only implies planning together with a time frame,
# e.g. "I have a DS exam in 3 days" or "midterm next week".
EXAM_RE = _rx(r"exams?", r"midterms?", r"finals?", r"tests?", r"assignments?")
TIMEFRAME_RE = _rx(
    r"in \d+ (?:days?|weeks?|hours?)", r"tomorrow", r"tonight", r"next (?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
    r"this (?:week|weekend)", r"\d+ (?:days?|weeks?) (?:left|away|to go)", r"due",
    r"on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
)
# Messages that are clearly asking for an explanation.
QUESTION_START_RE = re.compile(
    r"^\s*(?:explain|what|why|how|when|where|who|which|define|describe|compare|"
    r"teach me|tell me|can you explain|could you explain|walk me through|solve)\b",
    re.IGNORECASE,
)


HEAD_CHARS = 200


def detect_intent(user_input: str) -> IntentType:
    text = user_input.strip()
    if not text:
        return "coordinator"

    first_word = text.split(maxsplit=1)[0].lower()
    if first_word in SLASH_COMMANDS:
        return SLASH_COMMANDS[first_word]

    # The instruction is at the start; pasted notes after it (e.g. "Generate
    # 10 flashcards from these notes: ...") must not change the route.
    text = text[:HEAD_CHARS]

    if QUIZ_RE.search(text):
        return "quiz"
    if FLASHCARD_RE.search(text):
        return "flashcard"
    if SUMMARY_RE.search(text):
        return "summarizer"

    if QUESTION_START_RE.match(text) and not PLAN_RE.search(text):
        return "advisor"
    if PLAN_RE.search(text):
        return "planner"
    if EXAM_RE.search(text) and TIMEFRAME_RE.search(text):
        return "planner"
    return "advisor"
