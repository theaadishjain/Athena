"""Model endpoint configuration (OpenRouter or Google's Gemini API) and
the messages students see when the model call fails."""
import asyncio

import httpx
import openai
import pytest

from app.agents.shared.executor import AUTH_MESSAGE, BUSY_MESSAGE, RATE_LIMIT_MESSAGE, AgentExecutor, failure_message
from app.core.config import OPENROUTER_BASE_URL, get_settings
from app.services.llm import get_llm

GOOGLE = "https://generativelanguage.googleapis.com/v1beta/openai/"


@pytest.fixture
def settings(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "llm_base_url", OPENROUTER_BASE_URL)
    monkeypatch.setattr(s, "llm_api_key", "")
    monkeypatch.setattr(s, "llm_reasoning_effort", "")
    monkeypatch.setattr(s, "openrouter_api_key", "or-key")
    monkeypatch.setattr(s, "llm_fallback_model", "")
    monkeypatch.setattr(s, "llm_document_model", "")
    return s


def test_openrouter_is_the_default(settings):
    llm = get_llm()
    assert llm.openai_api_base == OPENROUTER_BASE_URL
    assert llm.openai_api_key.get_secret_value() == "or-key"
    assert llm.default_headers["X-Title"] == "Athena AI"
    assert llm.reasoning_effort is None


def test_gemini_api_key_uses_google_endpoint_with_low_thinking(settings, monkeypatch):
    monkeypatch.setattr(settings, "llm_base_url", GOOGLE)
    monkeypatch.setattr(settings, "llm_api_key", "gemini-key")
    monkeypatch.setattr(settings, "llm_model", "gemini-3.8-flash")

    llm = get_llm(max_tokens=2500)

    assert llm.openai_api_base == GOOGLE
    assert llm.openai_api_key.get_secret_value() == "gemini-key"
    assert llm.model_name == "gemini-3.8-flash"
    assert llm.max_tokens == 2500
    assert llm.reasoning_effort == "low"  # thinking mustn't eat the answer's budget
    assert not (llm.default_headers or {}).get("X-Title")  # OpenRouter-only headers


def test_openrouter_key_is_never_sent_to_google(settings, monkeypatch):
    monkeypatch.setattr(settings, "llm_base_url", GOOGLE)
    assert settings.resolved_llm_api_key == ""


def test_reasoning_effort_can_be_overridden(settings, monkeypatch):
    monkeypatch.setattr(settings, "llm_base_url", GOOGLE)
    monkeypatch.setattr(settings, "llm_reasoning_effort", "medium")
    assert get_llm().reasoning_effort == "medium"


def test_backup_model_takes_over_when_the_main_one_is_busy(settings, monkeypatch):
    monkeypatch.setattr(settings, "llm_base_url", GOOGLE)
    monkeypatch.setattr(settings, "llm_api_key", "gemini-key")
    monkeypatch.setattr(settings, "llm_model", "gemini-3.8-flash")
    monkeypatch.setattr(settings, "llm_fallback_model", "gemini-3.5-flash-lite")

    llm = get_llm(max_tokens=900, stream_to_user=True)

    chain = llm.bound  # with_config(tags) wraps the fallback runnable
    assert chain.runnable.model_name == "gemini-3.8-flash"
    assert chain.runnable.max_retries == 1  # give up on the busy model quickly
    assert chain.fallbacks[0].model_name == "gemini-3.5-flash-lite"
    assert chain.fallbacks[0].max_tokens == 900
    assert openai.InternalServerError in chain.exceptions_to_handle  # 503 overloaded
    assert openai.RateLimitError in chain.exceptions_to_handle
    assert openai.AuthenticationError not in chain.exceptions_to_handle


def test_document_work_uses_the_document_model_with_the_main_one_as_backup(settings, monkeypatch):
    monkeypatch.setattr(settings, "llm_base_url", GOOGLE)
    monkeypatch.setattr(settings, "llm_model", "gemini-3.8-flash")
    monkeypatch.setattr(settings, "llm_document_model", "gemini-3.5-flash-lite")
    monkeypatch.setattr(settings, "llm_fallback_model", "gemini-3.5-flash-lite")

    assert settings.document_model == "gemini-3.5-flash-lite"
    doc_llm = get_llm(model=settings.document_model)
    assert doc_llm.runnable.model_name == "gemini-3.5-flash-lite"
    assert doc_llm.fallbacks[0].model_name == "gemini-3.8-flash"  # never "falls back" to itself
    chat_llm = get_llm()
    assert chat_llm.runnable.model_name == "gemini-3.8-flash"
    assert chat_llm.fallbacks[0].model_name == "gemini-3.5-flash-lite"


def test_document_model_defaults_to_the_main_model(settings):
    assert settings.document_model == settings.llm_model


def _api_error(cls, status):
    request = httpx.Request("POST", "https://example.test/chat/completions")
    return cls("boom", response=httpx.Response(status, request=request), body=None)


def test_failures_explain_what_went_wrong():
    assert failure_message(_api_error(openai.RateLimitError, 429), "advisor") == RATE_LIMIT_MESSAGE
    assert failure_message(_api_error(openai.InternalServerError, 503), "advisor") == BUSY_MESSAGE
    assert failure_message(_api_error(openai.AuthenticationError, 401), "quiz") == AUTH_MESSAGE
    google_bad_key = openai.BadRequestError(
        "Error code: 400",
        response=httpx.Response(400, request=httpx.Request("POST", "https://example.test")),
        body=[{"error": {"code": 400, "message": "Please pass a valid API key", "status": "INVALID_ARGUMENT"}}],
    )
    assert failure_message(google_bad_key, "advisor") == AUTH_MESSAGE
    assert failure_message(ValueError("bad json"), "quiz") == "Could not generate quiz questions. Please try again."


def test_executor_turns_a_rate_limit_into_a_friendly_reply():
    async def agent(state):
        raise _api_error(openai.RateLimitError, 429)

    state = asyncio.run(AgentExecutor().run({"intent": "advisor"}, agent))
    assert state["agent_output"] == RATE_LIMIT_MESSAGE
    assert state["error"]
