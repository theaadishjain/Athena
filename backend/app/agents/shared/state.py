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
    # An uploaded document split into citable segments (see services.ingest
    # ParsedDocument). When present, the summarizer summarizes all of it with
    # page / line citations instead of summarizing `input`.
    document: Optional[dict]
    # How many flashcards to make from `document` (the Flashcards page's 10/20/30).
    requested_count: Optional[int]
