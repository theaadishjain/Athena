from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.agents.shared.state import AcademicState
from app.core.auth import get_current_user
from app.core.dependencies import get_coordinator_workflow
from app.schemas.responses import Flashcard, UnifiedResponse
from app.services.ingest import extract_upload_document, extract_upload_text

router = APIRouter(tags=["documents"])


@router.post("/summarize", response_model=UnifiedResponse)
async def summarize(
    file: UploadFile = File(...),
    session_id: str = Form(..., min_length=1, max_length=100),
    user_id: str = Depends(get_current_user),
) -> UnifiedResponse:
    document = await extract_upload_document(file)
    # The opening text stands in for the document in memory lookups and
    # topic detection; the summarizer itself reads every segment.
    opening = " ".join(segment["text"] for segment in document["segments"][:3])[:2000]

    state = AcademicState(
        user_id=user_id,
        session_id=session_id,
        input=opening,
        intent="summarizer",
        history=[],
        memory_context=[],
        agent_output="",
        memory_written=False,
        error=None,
        document=document,
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
    """Return a document's plain text, capped at 8,000 characters, for API
    clients that just need a quick text preview. The app's own flashcards use
    /flashcards/document, which reads the whole file."""
    text = await extract_upload_text(file)
    return {"filename": file.filename, "text": text}


@router.post("/flashcards/document", response_model=UnifiedResponse)
async def flashcards_from_document(
    file: UploadFile = File(...),
    count: int = Form(10, ge=1, le=50),
    session_id: str = Form(..., min_length=1, max_length=100),
    user_id: str = Depends(get_current_user),
) -> UnifiedResponse:
    """Flashcards from the whole uploaded file (not just its first pages),
    each one citing the page or line range it came from."""
    document = await extract_upload_document(file)
    state = AcademicState(
        user_id=user_id,
        session_id=session_id,
        input=f"Generate {count} flashcards from {file.filename}",
        intent="flashcard",
        history=[],
        memory_context=[],
        agent_output="",
        memory_written=False,
        error=None,
        flashcards=None,
        document=document,
        requested_count=count,
    )
    result = await get_coordinator_workflow().run(state)
    cards = result.get("flashcards") or None
    return UnifiedResponse(
        status="error" if result.get("error") or not cards else "success",
        agent="flashcard",
        response=result["agent_output"],
        memory_updated=result.get("memory_written", False),
        fallback=bool(result.get("error")),
        flashcards=[Flashcard(**c) for c in cards] if cards else None,
    )
