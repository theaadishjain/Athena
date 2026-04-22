from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    input: str = Field(..., min_length=1)


class PlanRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    input: str = Field(..., min_length=1)
