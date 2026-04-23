import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete
from app.core.database import get_db, ChatSession, Message, SessionNote
from app.core.auth import get_current_user

router = APIRouter(prefix="/sessions", tags=["sessions"])


class NotePayload(BaseModel):
    filename: str
    summary: str


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
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "title": s.title,
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]


@router.post("")
async def create_session(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = ChatSession(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title="New Chat",
    )
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
    notes = result.scalars().all()
    return [
        {
            "id": n.id,
            "filename": n.filename,
            "summary": n.summary,
            "created_at": n.created_at.isoformat(),
        }
        for n in notes
    ]


@router.delete("/empty")
async def delete_empty_sessions(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Find all session IDs that have at least one message
    subquery = select(Message.session_id).distinct()
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.user_id == user_id,
            ChatSession.id.not_in(subquery),
        )
    )
    empty_sessions = result.scalars().all()
    count = len(empty_sessions)

    for session in empty_sessions:
        await db.delete(session)
    await db.commit()

    return {"deleted": count}


@router.get("/{session_id}/messages")
async def get_messages(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    msgs = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at)
    )
    return [
        {"role": m.role, "content": m.content, "agent": m.agent}
        for m in msgs.scalars().all()
    ]


@router.post("/{session_id}/messages")
async def save_message(
    session_id: str,
    payload: dict,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify session belongs to this user
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=403, detail="Access denied")

    # Auto-title session from first user message
    if payload.get("role") == "user":
        if session and session.title == "New Chat":
            session.title = payload["content"][:40]
            await db.commit()

    message = Message(
        session_id=session_id,
        user_id=user_id,
        role=payload["role"],
        content=payload["content"],
        agent=payload.get("agent"),
    )
    db.add(message)
    await db.commit()
    return {"status": "saved"}


@router.post("/{session_id}/notes")
async def save_note(
    session_id: str,
    payload: NotePayload,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # No ownership check — session may be a local UUID created by notes page
    # before a chat session exists in DB. Auth is still enforced via JWT.
    note = SessionNote(
        session_id=session_id,
        user_id=user_id,
        filename=payload.filename,
        summary=payload.summary,
    )
    db.add(note)
    await db.commit()
    return {"status": "saved"}


@router.get("/{session_id}/notes")
async def get_notes(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify session belongs to this user
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(SessionNote)
        .where(SessionNote.session_id == session_id)
        .order_by(SessionNote.created_at)
    )
    notes = result.scalars().all()
    return [
        {"filename": n.filename, "summary": n.summary}
        for n in notes
    ]


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify session belongs to this user
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Delete messages first (foreign key safety)
    await db.execute(
        delete(Message).where(Message.session_id == session_id)
    )
    # Delete notes
    await db.execute(
        delete(SessionNote).where(SessionNote.session_id == session_id)
    )
    # Delete session
    await db.delete(session)
    await db.commit()
    return {"status": "deleted"}
