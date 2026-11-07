from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(value: datetime | None) -> str | None:
    """Serialize a timestamp as ISO-8601 with an explicit UTC offset.

    SQLite drops tzinfo, so values come back naive even though they were
    written in UTC. Without the offset, browsers parse them as local time.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class Base(DeclarativeBase):
    pass


class ChatSession(Base):
    __tablename__ = "sessions"
    id         = Column(String, primary_key=True)
    user_id    = Column(String, nullable=False, index=True)
    title      = Column(String, nullable=False, default="New Chat")
    created_at = Column(DateTime, default=utcnow)


class Message(Base):
    __tablename__ = "messages"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, index=True)
    user_id    = Column(String, nullable=False)
    role       = Column(String, nullable=False)
    content    = Column(Text, nullable=False)
    agent      = Column(String, nullable=True)
    # JSON blob for structured output (flashcards / quiz) so it survives reloads.
    extra      = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class SessionNote(Base):
    __tablename__ = "session_notes"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, index=True)
    user_id    = Column(String, nullable=False, index=True)
    filename   = Column(String, nullable=False)
    summary    = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class QuizResult(Base):
    """One finished quiz attempt. Missed questions also become a
    weak-area memory, which the Quiz agent reads next time."""
    __tablename__ = "quiz_results"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=True)
    topic      = Column(String, nullable=False)
    score      = Column(Integer, nullable=False)
    total      = Column(Integer, nullable=False)
    # JSON list of {"question", "correct_answer"} for the questions missed.
    missed     = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class ReviewCard(Base):
    """A flashcard on the student's spaced-repetition schedule (SM-2)."""
    __tablename__ = "review_cards"
    __table_args__ = (UniqueConstraint("user_id", "question", name="uq_review_card_question"),)
    id               = Column(Integer, primary_key=True, autoincrement=True)
    user_id          = Column(String, nullable=False, index=True)
    deck             = Column(String, nullable=False, default="Flashcards")
    question         = Column(Text, nullable=False)
    answer           = Column(Text, nullable=False)
    source           = Column(String, nullable=True)
    ease             = Column(Float, nullable=False, default=2.5)
    interval_days    = Column(Integer, nullable=False, default=0)
    repetitions      = Column(Integer, nullable=False, default=0)
    lapses           = Column(Integer, nullable=False, default=0)
    due_at           = Column(DateTime, nullable=False, default=utcnow, index=True)
    last_reviewed_at = Column(DateTime, nullable=True)
    created_at       = Column(DateTime, default=utcnow)


engine = create_async_engine(get_settings().database_url, echo=False)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Columns added after the first release. create_all() never alters existing
# tables, so add them by hand on startup.
_ADDED_COLUMNS = {
    "messages": {"extra": "TEXT"},
}


async def _migrate(conn) -> None:
    if conn.dialect.name != "sqlite":
        return
    for table, columns in _ADDED_COLUMNS.items():
        rows = await conn.execute(text(f"PRAGMA table_info({table})"))
        existing = {row[1] for row in rows}
        for name, ddl in columns.items():
            if name not in existing:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)
        await _migrate(conn)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
