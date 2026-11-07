from typing import List, Optional

from pydantic import BaseModel, Field

# user_id is never taken from the request; it always comes from the JWT.


class MemoryWriteRequest(BaseModel):
    memory_type: str = Field(..., min_length=1, max_length=64)
    content: str = Field(..., min_length=1, max_length=10_000)


class MemoryReadRequest(BaseModel):
    memory_type: str = Field(..., min_length=1, max_length=64)
    query: Optional[str] = Field(default=None, min_length=1, max_length=1_000)
    k: Optional[int] = Field(default=None, ge=1, le=20)


class MemoryReadResponse(BaseModel):
    user_id: str
    memory_type: str
    memories: List[str]
