from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.shared.state import AcademicState
from app.core.auth import get_current_user
from app.core.database import get_db, SessionNote
from app.core.dependencies import get_coordinator_workflow
from app.schemas.requests import MAX_INPUT_CHARS, PlanRequest
from app.schemas.responses import UnifiedResponse
from app.services.ingest import extract_upload_document

router = APIRouter(prefix="/plan", tags=["plan"])

# A syllabus is usually a few pages; this keeps the planner prompt bounded.
MAX_SYLLABUS_CHARS = 40_000


async def _run_planner(
    db: AsyncSession, user_id: str, session_id: str, text: str, attachment: Optional[str] = None
) -> UnifiedResponse:
    state = AcademicState(
        user_id=user_id,
        session_id=session_id,
        input=text,
        intent="planner",
        history=[],
        memory_context=[],
        agent_output="",
        memory_written=False,
        error=None,
        attachment=attachment,
    )
    result = await get_coordinator_workflow().run(state)

    # Persist generated plan to session_notes so it appears in Past Summaries
    if not result.get("error") and result.get("agent_output"):
        db.add(SessionNote(
            session_id=session_id,
            user_id=user_id,
            filename="Study Plan",
            summary=result["agent_output"],
        ))
        await db.commit()

    return UnifiedResponse(
        status="error" if result.get("error") else "success",
        agent="planner",
        response=result["agent_output"],
        memory_updated=result.get("memory_written", False),
        fallback=bool(result.get("error")),
    )


@router.post("", response_model=UnifiedResponse)
async def plan(
    payload: PlanRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnifiedResponse:
    return await _run_planner(db, user_id, payload.session_id, payload.input)


@router.post("/syllabus", response_model=UnifiedResponse)
async def plan_from_syllabus(
    file: UploadFile = File(...),
    input: str = Form(..., min_length=1, max_length=MAX_INPUT_CHARS),
    session_id: str = Form(..., min_length=1, max_length=100),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnifiedResponse:
    """Plan from an uploaded syllabus / course outline (PDF, TXT or MD)."""
    document = await extract_upload_document(file)
    syllabus = "\n\n".join(f"[{s['label']}] {s['text']}" for s in document["segments"])
    if len(syllabus) > MAX_SYLLABUS_CHARS:
        syllabus = syllabus[:MAX_SYLLABUS_CHARS] + "\n[...syllabus truncated]"
    return await _run_planner(db, user_id, session_id, input, attachment=f"({file.filename})\n{syllabus}")
