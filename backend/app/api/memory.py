from fastapi import APIRouter, Depends

from app.core.dependencies import get_memory_provider
from app.schemas.memory import MemoryReadRequest, MemoryReadResponse, MemoryWriteRequest

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("", response_model=MemoryReadResponse)
async def memory_read(payload: MemoryReadRequest = Depends()) -> MemoryReadResponse:
    provider = get_memory_provider()
    result = provider.read_memory_result(
        user_id=payload.user_id,
        memory_type=payload.memory_type,
        query=payload.query or payload.memory_type,
        k=payload.k,
    )
    memories = result["memories"]
    return MemoryReadResponse(
        user_id=payload.user_id,
        memory_type=payload.memory_type,
        memories=memories,
    )


@router.post("")
async def memory_write(payload: MemoryWriteRequest) -> dict:
    provider = get_memory_provider()
    result = provider.write_memory_result(
        user_id=payload.user_id,
        memory_type=payload.memory_type,
        content=payload.content,
    )
    if result["status"] == "error":
        return {
            "status": "error",
            "error": result["error"],
            "user_id": payload.user_id,
            "memory_type": payload.memory_type,
        }
    return {
        "status": "success",
        "user_id": payload.user_id,
        "memory_type": payload.memory_type,
    }
