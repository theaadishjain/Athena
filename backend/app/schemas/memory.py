from typing import List, Optional

from pydantic import BaseModel, Field


class MemoryWriteRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    memory_type: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)


class MemoryReadRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    memory_type: str = Field(..., min_length=1)
    query: Optional[str] = Field(default=None, min_length=1)
    k: Optional[int] = Field(default=None, ge=1)


class MemoryReadResponse(BaseModel):
    user_id: str
    memory_type: str
    memories: List[str]
