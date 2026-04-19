from fastapi import APIRouter

from app.agents.shared.state import AcademicState
from app.core.dependencies import get_coordinator_workflow
from app.schemas.requests import ChatRequest
from app.schemas.responses import UnifiedResponse

router = APIRouter(prefix="/plan", tags=["plan"])


@router.post("", response_model=UnifiedResponse)
async def plan(payload: ChatRequest) -> UnifiedResponse:
    state = AcademicState(
        user_id=payload.user_id,
        session_id=payload.session_id,
        input=payload.input,
        intent="planner",
        memory_context=[],
        agent_output="",
        memory_written=False,
        error=None,
    )
    workflow = get_coordinator_workflow()
    result = await workflow.run(state)
    return UnifiedResponse(
        status="error" if result.get("error") else "success",
        agent="planner",
        response=result["agent_output"],
        memory_updated=result["memory_written"],
        fallback=bool(result.get("error")),
    )
