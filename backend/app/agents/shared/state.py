from typing import List, Literal, Optional, TypedDict


IntentType = Literal["planner", "summarizer", "advisor", "coordinator", "flashcard", "quiz"]


class AcademicState(TypedDict):
    user_id: str
    session_id: str
    input: str
    intent: IntentType
    memory_context: List[str]
    agent_output: str
    memory_written: bool
    error: Optional[str]
    flashcards: Optional[List[dict]]
    quiz: Optional[List[dict]]

