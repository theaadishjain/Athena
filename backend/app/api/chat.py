import asyncio
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from typing import Literal

from app.agents.coordinator.workflow import CoordinatorWorkflow
from app.agents.shared.state import AcademicState
from app.core.dependencies import get_coordinator_workflow
from app.schemas.requests import ChatRequest

router = APIRouter(prefix="/chat", tags=["chat"])


def build_state(
    payload: ChatRequest,
    intent: Literal["planner", "summarizer", "advisor", "coordinator", "flashcard"],
) -> AcademicState:
    return AcademicState(
        user_id=payload.user_id,
        session_id=payload.session_id,
        input=payload.input,
        intent=intent,
        memory_context=[],
        agent_output="",
        memory_written=False,
        error=None,
        flashcards=None,
    )


@router.post("")
async def chat(payload: ChatRequest) -> StreamingResponse:
    async def generate():
        try:
            state = build_state(payload, "coordinator")
            workflow = get_coordinator_workflow()
            result = await workflow.run(state)
            
            response_text = result["agent_output"]
            agent = result["intent"]
            memory_updated = result["memory_written"]
            fallback = bool(result.get("error"))
            
            # Stream text token by token (word level is fine)
            words = response_text.split(" ")
            for i, word in enumerate(words):
                chunk = word if i == len(words) - 1 else word + " "
                data = json.dumps({"type": "token", "content": chunk})
                yield f"data: {data}\n\n"
                await asyncio.sleep(0.02)
            
            # Send final metadata chunk
            final = json.dumps({
                "type": "done",
                "agent": agent,
                "memory_updated": memory_updated,
                "fallback": fallback,
                "flashcards": result.get("flashcards")
            })
            yield f"data: {final}\n\n"

        except Exception as exc:
            import traceback
            traceback.print_exc()
            # Send error as done event so client doesn't hang
            error_final = json.dumps({
                "type": "done",
                "agent": "coordinator",
                "memory_updated": False,
                "fallback": True,
                "flashcards": None,
                "error": str(exc)
            })
            yield f"data: {error_final}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )
