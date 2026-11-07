from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.agents.shared.state import AcademicState
from app.core.auth import get_current_user
from app.core.dependencies import get_coordinator_workflow
from app.schemas.responses import UnifiedResponse
from app.services.ingest import extract_upload_text

router = APIRouter(tags=["documents"])


@router.post("/summarize", response_model=UnifiedResponse)
async def summarize(
    file: UploadFile = File(...),
    session_id: str = Form(..., min_length=1, max_length=100),
    user_id: str = Depends(get_current_user),
) -> UnifiedResponse:
    extracted_text = await extract_upload_text(file)

    state = AcademicState(
        user_id=user_id,
        session_id=session_id,
        input=extracted_text,
        intent="summarizer",
        history=[],
        memory_context=[],
        agent_output="",
        memory_written=False,
        error=None,
    )
    workflow = get_coordinator_workflow()
    result = await workflow.run(state)
    return UnifiedResponse(
        status="error" if result.get("error") else "success",
        agent="summarizer",
        response=result["agent_output"],
        memory_updated=result.get("memory_written", False),
        fallback=bool(result.get("error")),
    )


@router.post("/extract")
async def extract(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
) -> dict:
    """Return a document's plain text (capped) so the browser can use it,
    e.g. the Flashcards page, which can't parse PDFs itself."""
    text = await extract_upload_text(file)
    return {"filename": file.filename, "text": text}
