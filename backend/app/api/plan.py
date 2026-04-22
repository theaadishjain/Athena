from fastapi import APIRouter, Depends

from app.agents.shared.state import AcademicState
from app.core.auth import get_current_user
from app.core.dependencies import get_coordinator_workflow
from app.schemas.requests import PlanRequest
from app.schemas.responses import UnifiedResponse

router = APIRouter(prefix="/plan", tags=["plan"])


@router.post("", response_model=UnifiedResponse)
async def plan(
    payload: PlanRequest,
    user_id: str = Depends(get_current_user),
) -> UnifiedResponse:
    state = AcademicState(
        user_id=user_id,
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
