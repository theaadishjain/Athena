from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import ReviewCard, get_db, iso_utc
from app.services.spaced_repetition import Schedule, review

router = APIRouter(prefix="/reviews", tags=["reviews"])


def utc_now() -> datetime:
    # SQLite stores naive UTC, so compare and write naive UTC.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class NewCard(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    answer: str = Field(..., min_length=1, max_length=4000)
    source: Optional[str] = Field(default=None, max_length=40)
    deck: str = Field(default="Flashcards", min_length=1, max_length=200)


class GradeRequest(BaseModel):
    """Grade a scheduled card by id, or a fresh card (first grade adds it)."""
    card_id: Optional[int] = None
    card: Optional[NewCard] = None
    grade: Literal["missed", "got_it"]

    @model_validator(mode="after")
    def one_card(self):
        if (self.card_id is None) == (self.card is None):
            raise ValueError("send either card_id or card")
        return self


def card_out(card: ReviewCard) -> dict:
    return {
        "id": card.id,
        "question": card.question,
        "answer": card.answer,
        "source": card.source,
        "deck": card.deck,
        "due_at": iso_utc(card.due_at),
        "interval_days": card.interval_days,
        "lapses": card.lapses,
    }


@router.post("/grade")
async def grade_card(
    payload: GradeRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if payload.card_id is not None:
        card = await db.get(ReviewCard, payload.card_id)
        if card is None or card.user_id != user_id:
            raise HTTPException(status_code=404, detail="Card not found")
    else:
        new = payload.card
        question = new.question.strip()
        card = (await db.execute(
            select(ReviewCard).where(ReviewCard.user_id == user_id, ReviewCard.question == question)
        )).scalar_one_or_none()
        if card is None:
            card = ReviewCard(
                user_id=user_id, deck=new.deck.strip(), question=question,
                answer=new.answer.strip(), source=new.source, ease=2.5,
                interval_days=0, repetitions=0, lapses=0, due_at=utc_now(),
            )
            db.add(card)

    now = utc_now()
    schedule, due_at = review(
        Schedule(card.ease, card.interval_days, card.repetitions, card.lapses), payload.grade, now
    )
    card.ease = schedule.ease
    card.interval_days = schedule.interval_days
    card.repetitions = schedule.repetitions
    card.lapses = schedule.lapses
    card.due_at = due_at
    card.last_reviewed_at = now
    await db.commit()
    return card_out(card)


@router.get("/due")
async def due_cards(
    limit: int = Query(default=50, ge=1, le=200),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Cards due now, most overdue first; ties go to the most-missed card."""
    now = utc_now()
    rows = await db.execute(
        select(ReviewCard)
        .where(ReviewCard.user_id == user_id, ReviewCard.due_at <= now)
        .order_by(ReviewCard.due_at, ReviewCard.lapses.desc())
        .limit(limit)
    )
    due_count = await db.scalar(
        select(func.count()).select_from(ReviewCard).where(ReviewCard.user_id == user_id, ReviewCard.due_at <= now)
    )
    total = await db.scalar(select(func.count()).select_from(ReviewCard).where(ReviewCard.user_id == user_id))
    return {"cards": [card_out(c) for c in rows.scalars().all()], "due_count": due_count or 0, "total": total or 0}
