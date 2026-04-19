import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.agents.shared.state import AcademicState
from app.core.dependencies import get_coordinator_workflow
from app.schemas.responses import UnifiedResponse
from app.services.ingest import preprocess_document

router = APIRouter(prefix="/summarize", tags=["summarize"])


@router.post("", response_model=UnifiedResponse)
async def summarize(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    session_id: str = Form(...),
) -> UnifiedResponse:
    suffix = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        extracted_text = preprocess_document(tmp_path)
    except ValueError as e:
        os.remove(tmp_path)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        os.remove(tmp_path)
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

    os.remove(tmp_path)

    state = AcademicState(
        user_id=user_id,
        session_id=session_id,
        input=extracted_text,
        intent="summarizer",
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
        memory_updated=result["memory_written"],
        fallback=bool(result.get("error")),
    )
