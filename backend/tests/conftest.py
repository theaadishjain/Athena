import os
import tempfile
import uuid

# Configure before any app module reads settings.
_TMP = tempfile.mkdtemp(prefix="athena-tests-")
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///" + os.path.join(_TMP, "test.db").replace("\\", "/")
os.environ["MEMPALACE_PATH"] = os.path.join(_TMP, "palace")
os.environ["OPENROUTER_API_KEY"] = "test-key"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"
os.environ["CLERK_ISSUER"] = ""
os.environ["CLERK_AUTHORIZED_PARTIES"] = ""

from typing import Any, Iterator, List, Optional  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from langchain_core.language_models.chat_models import BaseChatModel  # noqa: E402
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage  # noqa: E402
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult  # noqa: E402
from pydantic import Field  # noqa: E402


class FakeChatModel(BaseChatModel):
    """Returns canned replies in order and records every prompt it gets."""

    responses: List[str]
    prompts: List[str] = Field(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "fake"

    def _next(self, messages: List[BaseMessage]) -> str:
        self.prompts.append(str(messages[-1].content))
        return self.responses[min(len(self.prompts), len(self.responses)) - 1]

    def _generate(self, messages, stop=None, run_manager=None, **kwargs: Any) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=self._next(messages)))])

    def _stream(self, messages, stop=None, run_manager=None, **kwargs: Any) -> Iterator[ChatGenerationChunk]:
        text = self._next(messages)
        words = text.split(" ")
        for i, word in enumerate(words):
            yield ChatGenerationChunk(message=AIMessageChunk(content=word if i == len(words) - 1 else word + " "))


class FakeMemory:
    def __init__(self) -> None:
        self.writes: list[tuple[str, str, str]] = []
        # Memories that reads return, keyed by memory type (seeded by tests).
        self.seeded: dict[str, list[str]] = {}

    async def aread_memory(self, user_id, memory_type, query, k=None):
        return list(self.seeded.get(memory_type, []))[: k or 3]

    async def awrite_memory(self, user_id, memory_type, content):
        self.writes.append((user_id, memory_type, content))

    async def aread_memory_result(self, user_id, memory_type, query, k=None):
        return {"status": "success", "memories": []}

    async def awrite_memory_result(self, user_id, memory_type, content):
        self.writes.append((user_id, memory_type, content))
        return {"status": "success"}


class Harness:
    """Builds a real CoordinatorWorkflow wired to fake LLMs and memory."""

    def __init__(self, monkeypatch) -> None:
        self.monkeypatch = monkeypatch
        self.memory = FakeMemory()
        self.models: dict[str, FakeChatModel] = {}
        self.user_id = f"user_{uuid.uuid4().hex[:8]}"

    def use_replies(self, **replies: List[str]) -> None:
        """replies keyed by agent: advisor=[...], planner=[...], flashcard=[...], ..."""
        from app.agents.advisor import nodes as advisor
        from app.agents.flashcard import nodes as flashcard
        from app.agents.planner import nodes as planner
        from app.agents.quiz import nodes as quiz
        from app.agents.summarizer import nodes as summarizer
        from app.agents.coordinator.workflow import CoordinatorWorkflow
        from app.services.llm import STREAM_TO_USER_TAG
        import app.api.chat as chat_api
        import app.api.plan as plan_api
        import app.api.summarize as summarize_api

        modules = {"advisor": advisor, "planner": planner, "summarizer": summarizer,
                   "flashcard": flashcard, "quiz": quiz}
        for name, module in modules.items():
            model = FakeChatModel(responses=replies.get(name, [f"{name} reply"]))
            self.models[name] = model

            def factory(max_tokens=500, stream_to_user=False, model=None, _m=model):
                return _m.with_config(tags=[STREAM_TO_USER_TAG]) if stream_to_user else _m

            self.monkeypatch.setattr(module, "get_llm", factory)

        workflow = CoordinatorWorkflow(self.memory)
        for api in (chat_api, plan_api, summarize_api):
            self.monkeypatch.setattr(api, "get_coordinator_workflow", lambda: workflow)

        from app.core.dependencies import get_memory_provider
        import app.api.memory as memory_api
        import app.api.quiz as quiz_api
        for api in (memory_api, quiz_api):
            self.monkeypatch.setattr(api, "get_memory_provider", lambda: self.memory)


@pytest.fixture
def harness(monkeypatch):
    return Harness(monkeypatch)


@pytest.fixture
def client(harness):
    from app.core.auth import get_current_user
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: harness.user_id
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
