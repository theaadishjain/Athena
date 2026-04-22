from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy import Column, String, Text, DateTime, Integer
from datetime import datetime, timezone
from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


class ChatSession(Base):
    __tablename__ = "sessions"
    id         = Column(String, primary_key=True)
    user_id    = Column(String, nullable=False, index=True)
    title      = Column(String, nullable=False, default="New Chat")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Message(Base):
    __tablename__ = "messages"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, index=True)
    user_id    = Column(String, nullable=False)
    role       = Column(String, nullable=False)
    content    = Column(Text, nullable=False)
    agent      = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SessionNote(Base):
    __tablename__ = "session_notes"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, index=True)
    user_id    = Column(String, nullable=False)
    filename   = Column(String, nullable=False)
    summary    = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


engine = create_async_engine(
    get_settings().database_url,
    echo=False,
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
