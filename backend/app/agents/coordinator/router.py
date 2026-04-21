import re

from app.agents.shared.state import IntentType

TASK_KEYWORDS = {
    "plan",
    "schedule",
    "deadline",
    "assignment",
    "exam",
    "task",
    "calendar",
    "week",
}

FLASHCARD_KEYWORDS = {
    "flashcard",
    "flash card",
    "make cards",
    "create cards",
    "quiz me",
    "test me",
    "make flashcards",
    "generate flashcards",
    "memorize",
    "drill"
}

QUIZ_KEYWORDS = {
    "quiz",
    "practice quiz",
    "multiple choice",
    "mcq",
    "test questions",
    "practice questions",
    "generate quiz",
    "create quiz",
}


def detect_intent(user_input: str) -> IntentType:
    lowered = user_input.lower()
    words = set(re.findall(r"\w+", lowered))
    if any(k in lowered for k in QUIZ_KEYWORDS):
        return "quiz"
    if any(k in lowered for k in FLASHCARD_KEYWORDS):
        return "flashcard"
    if "summarize" in lowered or "summary" in lowered:
        return "summarizer"
    if any(keyword in words for keyword in TASK_KEYWORDS):
        return "planner"
    if len(words) > 0:
        return "advisor"
    return "coordinator"
