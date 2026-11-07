import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import ChatSession, Message, SessionNote, get_db, iso_utc
from app.schemas.requests import MessagePayload, NotePayload

router = APIRouter(prefix="/sessions", tags=["sessions"])


async def get_owned_session(db: AsyncSession, session_id: str, user_id: str) -> ChatSession | None:
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id)
    )
    return result.scalar_one_or_none()


def _message_extra(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


@router.get("")
async def list_sessions(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == user_id)
        .order_by(desc(ChatSession.created_at))
        .limit(50)
    )
    return [
        {"id": s.id, "title": s.title, "created_at": iso_utc(s.created_at)}
        for s in result.scalars().all()
    ]


@router.post("")
async def create_session(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = ChatSession(id=str(uuid.uuid4()), user_id=user_id, title="New Chat")
    db.add(session)
    await db.commit()
    return {"id": session.id, "title": session.title}


@router.get("/notes/all")
async def get_all_notes(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SessionNote)
        .where(SessionNote.user_id == user_id)
        .order_by(desc(SessionNote.created_at))
        .limit(20)
    )
    return [
        {
            "id": n.id,
            "filename": n.filename,
            "summary": n.summary,
            "created_at": iso_utc(n.created_at),
        }
        for n in result.scalars().all()
    ]


@router.delete("/empty")
async def delete_empty_sessions(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    has_messages = select(Message.session_id).where(Message.user_id == user_id).distinct()
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.user_id == user_id,
            ChatSession.id.not_in(has_messages),
        )
    )
    empty_sessions = result.scalars().all()
    for session in empty_sessions:
        await db.delete(session)
    await db.commit()
    return {"deleted": len(empty_sessions)}


@router.get("/{session_id}/messages")
async def get_messages(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await get_owned_session(db, session_id, user_id):
        raise HTTPException(status_code=404, detail="Session not found")

    msgs = await db.execute(
        select(Message)
        .where(Message.session_id == session_id, Message.user_id == user_id)
        .order_by(Message.created_at, Message.id)
    )
    out = []
    for m in msgs.scalars().all():
        extra = _message_extra(m.extra)
        out.append({
            "role": m.role,
            "content": m.content,
            "agent": m.agent,
            "flashcards": extra.get("flashcards"),
            "quiz": extra.get("quiz"),
            "created_at": iso_utc(m.created_at),
        })
    return out


@router.post("/{session_id}/messages")
async def save_message(
    session_id: str,
    payload: MessagePayload,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # /chat saves its own messages; this stays for other clients.
    session = await get_owned_session(db, session_id, user_id)
    if not session:
        raise HTTPException(status_code=403, detail="Access denied")

    if payload.role == "user" and session.title == "New Chat":
        session.title = payload.content.strip()[:40] or "New Chat"

    db.add(Message(
        session_id=session_id,
        user_id=user_id,
        role=payload.role,
        content=payload.content,
        agent=payload.agent,
    ))
    await db.commit()
    return {"status": "saved"}


@router.post("/{session_id}/notes")
async def save_note(
    session_id: str,
    payload: NotePayload,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # The notes page may use a local session id that has no chat session yet,
    # so a missing session is fine, but someone else's session is not.
    existing = await db.get(ChatSession, session_id)
    if existing is not None and existing.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    db.add(SessionNote(
        session_id=session_id,
        user_id=user_id,
        filename=payload.filename,
        summary=payload.summary,
    ))
    await db.commit()
    return {"status": "saved"}


@router.get("/{session_id}/notes")
async def get_notes(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await get_owned_session(db, session_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(SessionNote)
        .where(SessionNote.session_id == session_id, SessionNote.user_id == user_id)
        .order_by(SessionNote.created_at)
    )
    return [{"filename": n.filename, "summary": n.summary} for n in result.scalars().all()]


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await get_owned_session(db, session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.execute(delete(Message).where(Message.session_id == session_id, Message.user_id == user_id))
    # Notes (summaries, study plans, saved answers) are deliberately kept.
    # They are only linked to the session they were created in, and users
    # expect them to outlive the chat; deleting a chat used to wipe them.
    await db.delete(session)
    await db.commit()
    return {"status": "deleted"}
