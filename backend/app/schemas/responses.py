from typing import Literal

from pydantic import BaseModel


class Flashcard(BaseModel):
    question: str
    answer: str
    source: str | None = None  # e.g. "p. 12" for cards made from a document

class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct: str
    explanation: str = ""


class UnifiedResponse(BaseModel):
    status: Literal["success", "error"]
    agent: Literal["planner", "summarizer", "advisor", "coordinator", "flashcard", "quiz"]
    response: str
    memory_updated: bool
    fallback: bool
    flashcards: list[Flashcard] | None = None
    quiz: list[QuizQuestion] | None = None
