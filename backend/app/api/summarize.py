import json
import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse

from app.agents.shared.parsing import message_text
from app.agents.shared.state import AcademicState
from app.core.auth import get_current_user
from app.core.dependencies import get_coordinator_workflow
from app.schemas.responses import Flashcard, UnifiedResponse
from app.services.ingest import ParsedDocument, extract_upload_document, extract_upload_text
from app.services.llm import STREAM_TO_USER_TAG

router = APIRouter(tags=["documents"])
logger = logging.getLogger(__name__)


def _summary_state(user_id: str, session_id: str, document: ParsedDocument) -> AcademicState:
    # The opening text stands in for the document in memory lookups and
    # topic detection; the summarizer itself reads every segment.
    opening = " ".join(segment["text"] for segment in document["segments"][:3])[:2000]
    return AcademicState(
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


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/summarize/stream")
async def summarize_stream(
    file: UploadFile = File(...),
    session_id: str = Form(..., min_length=1, max_length=100),
    user_id: str = Depends(get_current_user),
) -> StreamingResponse:
    """Like /summarize, but streams the summary as it is written (SSE):
    `token` events, then one `done` event whose `content` is the final,
    citation-checked text that replaces what was streamed."""
    document = await extract_upload_document(file)
    state = _summary_state(user_id, session_id, document)

    async def generate():
        result = None
        try:
            async for event in get_coordinator_workflow().graph.astream_events(state, version="v2"):
                kind = event["event"]
                if kind == "on_chat_model_stream" and STREAM_TO_USER_TAG in event.get("tags", []):
                    text = message_text(event["data"]["chunk"])
                    if text:
                        yield _sse({"type": "token", "content": text})
                elif kind == "on_chain_end" and not event.get("parent_ids"):
                    result = event["data"]["output"]
            if result is None:
                raise RuntimeError("Workflow finished without a result")
            yield _sse({
                "type": "done",
                "agent": "summarizer",
                "memory_updated": bool(result.get("memory_written")),
                "fallback": bool(result.get("error")),
                "content": result.get("agent_output", ""),
            })
        except Exception:
            logger.exception("Unhandled error in summary stream")
            yield _sse({
                "type": "done",
                "agent": "summarizer",
                "memory_updated": False,
                "fallback": True,
                "content": "I hit an internal issue while summarizing this file.",
            })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/summarize", response_model=UnifiedResponse)
async def summarize(
    file: UploadFile = File(...),
    session_id: str = Form(..., min_length=1, max_length=100),
    user_id: str = Depends(get_current_user),
) -> UnifiedResponse:
    document = await extract_upload_document(file)
    state = _summary_state(user_id, session_id, document)
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
