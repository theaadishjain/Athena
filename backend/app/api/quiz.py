import json
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.shared.memory_rules import quiz_topic, weak_area_from_quiz
from app.core.auth import get_current_user
from app.core.database import QuizResult, get_db, iso_utc
from app.core.dependencies import get_memory_provider

router = APIRouter(prefix="/quiz", tags=["quiz"])


class MissedQuestion(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    correct_answer: str = Field(default="", max_length=500)


class QuizResultPayload(BaseModel):
    # The request that produced the quiz, e.g. "Quiz me on photosynthesis".
    topic: str = Field(..., min_length=1, max_length=300)
    score: int = Field(..., ge=0)
    total: int = Field(..., ge=1, le=50)
    missed: List[MissedQuestion] = Field(default_factory=list, max_length=50)
    session_id: Optional[str] = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def check_counts(self):
        if self.score > self.total:
            raise ValueError("score cannot be higher than total")
        if len(self.missed) > self.total - self.score:
            raise ValueError("more missed questions than wrong answers")
        return self


@router.post("/results")
async def save_quiz_result(
    payload: QuizResultPayload,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    topic = quiz_topic(payload.topic)
    db.add(QuizResult(
        user_id=user_id,
        session_id=payload.session_id,
        topic=topic,
        score=payload.score,
        total=payload.total,
        missed=json.dumps([m.model_dump() for m in payload.missed]) if payload.missed else None,
    ))
    await db.commit()

    # Wrong answers become a weak area: the dashboard shows it and the Quiz
    # agent reads it to aim the next quiz at what the student got wrong.
    weak_area = weak_area_from_quiz(topic, payload.score, payload.total, [m.question for m in payload.missed])
    recorded = False
    if weak_area:
        result = await get_memory_provider().awrite_memory_result(user_id, "weak_subjects", weak_area)
        recorded = result.get("status") == "success"

    return {"status": "saved", "topic": topic, "weak_area_recorded": recorded}


@router.get("/results")
async def list_quiz_results(
    limit: int = Query(default=10, ge=1, le=50),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    rows = await db.execute(
        select(QuizResult)
        .where(QuizResult.user_id == user_id)
        .order_by(desc(QuizResult.created_at), desc(QuizResult.id))
        .limit(limit)
    )
    return [
        {
            "topic": r.topic,
            "score": r.score,
            "total": r.total,
            "missed": json.loads(r.missed) if r.missed else [],
            "created_at": iso_utc(r.created_at),
        }
        for r in rows.scalars().all()
    ]
