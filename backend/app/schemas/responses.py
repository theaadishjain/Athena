from typing import Literal

from pydantic import BaseModel


class Flashcard(BaseModel):
    question: str
    answer: str

class UnifiedResponse(BaseModel):
    status: Literal["success", "error"]
    agent: Literal["planner", "summarizer", "advisor", "coordinator", "flashcard", "quiz"]
    response: str
    memory_updated: bool
    fallback: bool
    flashcards: list[Flashcard] | None = None
