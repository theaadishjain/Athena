from typing import List, Literal, Optional, TypedDict


IntentType = Literal["planner", "summarizer", "advisor", "coordinator", "flashcard", "quiz"]


class HistoryMessage(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class AcademicState(TypedDict, total=False):
    user_id: str
    session_id: str
    input: str
    intent: IntentType
    # Earlier turns of this chat session, oldest first (excludes `input`).
    history: List[HistoryMessage]
    memory_context: List[str]
    agent_output: str
    memory_written: bool
    error: Optional[str]
    flashcards: Optional[List[dict]]
    quiz: Optional[List[dict]]
