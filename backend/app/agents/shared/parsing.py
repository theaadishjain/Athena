"""Helpers for turning LLM replies into structured data."""
import json
import re
from typing import Any, List

_FENCE_RE = re.compile(r"^\s*```[a-zA-Z0-9_-]*\s*|\s*```\s*$")


def message_text(response: Any) -> str:
    """Extract plain text from a LangChain message (or anything else)."""
    content = getattr(response, "content", response)
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part) for part in content
        )
    return str(content)


def parse_json_array(text: str) -> List[Any]:
    """Parse a JSON array from an LLM reply.

    Models often wrap JSON in ```json fences or add a sentence before it, so
    strip fences and fall back to the outermost [...] before giving up.
    Raises ValueError if no array can be found.
    """
    cleaned = _FENCE_RE.sub("", text.strip())
    candidates = [cleaned]
    start, end = cleaned.find("["), cleaned.rfind("]")
    if start != -1 and end > start:
        candidates.append(cleaned[start : end + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            return parsed
    raise ValueError("LLM reply did not contain a JSON array")


def clean_flashcards(items: List[Any]) -> List[dict]:
    cards = []
    for item in items:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question", "")).strip()
        answer = str(item.get("answer", "")).strip()
        if question and answer:
            cards.append({"question": question, "answer": answer})
    return cards


_LETTER_RE = re.compile(r"^\s*\(?([A-Da-d])[\).:\s]")


def _option_letter(value: str) -> str | None:
    value = value.strip()
    if len(value) == 1 and value.upper() in "ABCD":
        return value.upper()
    match = _LETTER_RE.match(value + " ")
    return match.group(1).upper() if match else None


def clean_quiz(items: List[Any]) -> List[dict]:
    questions = []
    for item in items:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question", "")).strip()
        options = [str(o).strip() for o in item.get("options") or [] if str(o).strip()]
        if not question or len(options) < 2:
            continue

        correct = str(item.get("correct", "")).strip()
        letter = _option_letter(correct)
        if letter is None:
            # Some models return the full option text instead of the letter.
            for idx, option in enumerate(options):
                if correct and correct.lower() in option.lower():
                    letter = "ABCD"[idx] if idx < 4 else None
                    break
        if letter is None or "ABCD".index(letter) >= len(options):
            continue

        questions.append({
            "question": question,
            "options": options,
            "correct": letter,
            "explanation": str(item.get("explanation", "")).strip(),
        })
    return questions
