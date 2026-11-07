from typing import Literal, Optional

from pydantic import BaseModel, Field

MAX_INPUT_CHARS = 20_000


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    input: str = Field(..., min_length=1, max_length=MAX_INPUT_CHARS)
    # False for one-off tool calls (e.g. the Flashcards page) that shouldn't
    # create a chat session or use its history.
    persist: bool = True


class PlanRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=100)
    input: str = Field(..., min_length=1, max_length=MAX_INPUT_CHARS)


class MessagePayload(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=100_000)
    agent: Optional[str] = Field(default=None, max_length=32)


class NotePayload(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    summary: str = Field(..., min_length=1, max_length=200_000)
