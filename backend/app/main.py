from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.chat import router as chat_router
from app.api.memory import router as memory_router
from app.api.plan import router as plan_router
from app.api.summarize import router as summarize_router
from app.api.sessions import router as sessions_router
from app.core.config import get_settings
from app.core.database import init_db

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="StudyCo API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(summarize_router)
app.include_router(plan_router)
app.include_router(memory_router)
app.include_router(sessions_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
