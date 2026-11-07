import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.advisor.nodes import MODE_LABEL_RE
from app.agents.shared.parsing import message_text
from app.agents.shared.state import AcademicState, HistoryMessage
from app.core.auth import get_current_user
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, ChatSession, Message, get_db
from app.core.dependencies import get_coordinator_workflow
from app.schemas.requests import ChatRequest
from app.services.llm import STREAM_TO_USER_TAG

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

TITLE_CHARS = 40


def sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


class LabelFilter:
    """Hold back the first few streamed characters so a leaked
    "BRIEF mode:" label can be stripped before the user sees it."""

    HOLD_CHARS = 24

    def __init__(self) -> None:
        self._buffer = ""
        self._released = False

    def feed(self, chunk: str) -> str:
        if self._released:
            return chunk
        self._buffer += chunk
        if len(self._buffer) < self.HOLD_CHARS and "\n" not in self._buffer:
            return ""
        return self.flush()

    def flush(self) -> str:
        if self._released:
            return ""
        self._released = True
        out = MODE_LABEL_RE.sub("", self._buffer, count=1).lstrip()
        self._buffer = ""
        return out


async def get_or_create_session(db: AsyncSession, session_id: str, user_id: str) -> ChatSession:
    session = await db.get(ChatSession, session_id)
    if session is None:
        session = ChatSession(id=session_id, user_id=user_id, title="New Chat")
        db.add(session)
        await db.flush()
    elif session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return session


async def load_history(db: AsyncSession, session_id: str, limit: int) -> list[HistoryMessage]:
    if limit <= 0:
        return []
    rows = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(desc(Message.created_at), desc(Message.id))
        .limit(limit)
    )
    messages = list(reversed(rows.scalars().all()))
    return [{"role": m.role, "content": m.content} for m in messages if m.role in ("user", "assistant")]


async def save_assistant_message(session_id: str, user_id: str, result: dict) -> None:
    extra = {}
    if result.get("flashcards"):
        extra["flashcards"] = result["flashcards"]
    if result.get("quiz"):
        extra["quiz"] = result["quiz"]
    # The request's DB session is closed once the response starts streaming,
    # so use a fresh one here.
    async with AsyncSessionLocal() as db:
        db.add(Message(
            session_id=session_id,
            user_id=user_id,
            role="assistant",
            content=result.get("agent_output") or "",
            agent=result.get("intent"),
            extra=json.dumps(extra) if extra else None,
        ))
        await db.commit()


@router.post("")
async def chat(
    payload: ChatRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    history: list[HistoryMessage] = []
    if payload.persist:
        session = await get_or_create_session(db, payload.session_id, user_id)
        history = await load_history(db, payload.session_id, get_settings().chat_history_messages)
        # Save the user's message before generating, so it isn't lost if the
        # reply fails and the session isn't cleaned up as "empty" meanwhile.
        if session.title == "New Chat":
            session.title = payload.input.strip()[:TITLE_CHARS] or "New Chat"
        db.add(Message(session_id=payload.session_id, user_id=user_id, role="user", content=payload.input))
        await db.commit()

    state = AcademicState(
        user_id=user_id,
        session_id=payload.session_id,
        input=payload.input,
        intent="coordinator",
        history=history,
        memory_context=[],
        agent_output="",
        memory_written=False,
        error=None,
        flashcards=None,
        quiz=None,
    )

    async def generate():
        result: dict | None = None
        streamed_any = False
        label_filter = LabelFilter()
        try:
            workflow = get_coordinator_workflow()
            async for event in workflow.graph.astream_events(state, version="v2"):
                kind = event["event"]
                if kind == "on_chat_model_stream" and STREAM_TO_USER_TAG in event.get("tags", []):
                    text = label_filter.feed(message_text(event["data"]["chunk"]))
                    if text:
                        streamed_any = True
                        yield sse({"type": "token", "content": text})
                elif kind == "on_chain_end" and not event.get("parent_ids"):
                    result = event["data"]["output"]

            tail = label_filter.flush()
            if tail:
                streamed_any = True
                yield sse({"type": "token", "content": tail})

            if result is None:
                raise RuntimeError("Workflow finished without a result")

            if payload.persist:
                try:
                    await save_assistant_message(payload.session_id, user_id, result)
                except Exception:
                    logger.exception("Failed to save assistant message")

            yield sse({
                "type": "done",
                "agent": result.get("intent", "coordinator"),
                "memory_updated": bool(result.get("memory_written")),
                "fallback": bool(result.get("error")),
                # Authoritative final text. The client replaces the streamed
                # text with it (covers non-streaming agents and fallbacks).
                "content": result.get("agent_output", ""),
                "streamed": streamed_any,
                "flashcards": result.get("flashcards"),
                "quiz": result.get("quiz"),
            })
        except Exception:
            logger.exception("Unhandled error in chat stream")
            yield sse({
                "type": "done",
                "agent": "coordinator",
                "memory_updated": False,
                "fallback": True,
                "content": "I hit an internal issue while processing your request.",
                "streamed": streamed_any,
                "flashcards": None,
                "quiz": None,
            })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
