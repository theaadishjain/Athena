import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.database import _migrate, iso_utc


def test_iso_utc_naive_is_treated_as_utc():
    assert iso_utc(datetime(2026, 1, 2, 3, 4, 5)) == "2026-01-02T03:04:05Z"


def test_iso_utc_converts_offsets():
    ist = timezone(timedelta(hours=5, minutes=30))
    assert iso_utc(datetime(2026, 1, 2, 8, 34, 5, tzinfo=ist)) == "2026-01-02T03:04:05Z"


def test_migration_adds_extra_column_to_old_db(tmp_path):
    async def run():
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'old.db'}")
        async with engine.begin() as conn:
            # Schema as shipped before this change.
            await conn.execute(text(
                "CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT, user_id TEXT, "
                "role TEXT, content TEXT, agent TEXT, created_at DATETIME)"
            ))
            await _migrate(conn)
            await _migrate(conn)  # idempotent
            cols = {row[1] for row in await conn.execute(text("PRAGMA table_info(messages)"))}
        await engine.dispose()
        return cols

    assert "extra" in asyncio.run(run())
