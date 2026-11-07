from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import Message, QuizResult, ReviewCard, get_db, iso_utc

router = APIRouter(prefix="/stats", tags=["stats"])

AGENTS = ("advisor", "planner", "summarizer", "flashcard", "quiz")
USAGE_DAYS = 30
STREAK_LOOKBACK_DAYS = 400


def study_streak(days: set[date], today: date) -> int:
    """Consecutive days of study ending today (or yesterday, so a streak
    isn't shown as broken before today's session)."""
    day = today if today in days else today - timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


@router.get("")
async def get_stats(
    # The browser's Date.getTimezoneOffset(): minutes to ADD to local time to get UTC.
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Chat replies by agent over the last 30 days (from saved messages).
    rows = await db.execute(
        select(Message.agent, func.count())
        .where(Message.user_id == user_id, Message.role == "assistant",
               Message.created_at >= now - timedelta(days=USAGE_DAYS))
        .group_by(Message.agent)
    )
    counts = {agent: 0 for agent in AGENTS}
    for agent, n in rows.all():
        if agent in counts:
            counts[agent] = n

    # Study days: chatting, finishing a quiz or reviewing flashcards.
    since = now - timedelta(days=STREAK_LOOKBACK_DAYS)
    stamps = list((await db.execute(
        select(Message.created_at).where(Message.user_id == user_id, Message.role == "user", Message.created_at >= since)
    )).scalars())
    stamps += list((await db.execute(
        select(QuizResult.created_at).where(QuizResult.user_id == user_id, QuizResult.created_at >= since)
    )).scalars())
    stamps += list((await db.execute(
        select(ReviewCard.last_reviewed_at).where(ReviewCard.user_id == user_id, ReviewCard.last_reviewed_at >= since)
    )).scalars())
    offset = timedelta(minutes=tz_offset_minutes)
    local_days = {(s.replace(tzinfo=None) - offset).date() for s in stamps if s}
    today = (now - offset).date()

    quizzes = (await db.execute(
        select(QuizResult).where(QuizResult.user_id == user_id)
        .order_by(desc(QuizResult.created_at), desc(QuizResult.id)).limit(5)
    )).scalars().all()

    due = await db.scalar(select(func.count()).select_from(ReviewCard)
                          .where(ReviewCard.user_id == user_id, ReviewCard.due_at <= now))
    total_cards = await db.scalar(select(func.count()).select_from(ReviewCard).where(ReviewCard.user_id == user_id))

    return {
        "agent_counts": counts,
        "usage_days": USAGE_DAYS,
        "streak_days": study_streak(local_days, today),
        "studied_today": today in local_days,
        "recent_quizzes": [
            {"topic": q.topic, "score": q.score, "total": q.total, "created_at": iso_utc(q.created_at)}
            for q in quizzes
        ],
        "reviews_due": due or 0,
        "review_cards": total_cards or 0,
    }
