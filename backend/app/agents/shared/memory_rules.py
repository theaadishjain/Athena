"""Decide what is worth writing to long-term memory.

Memory feeds every future prompt and the dashboard's profile, so only store
short, specific facts: a sentence where the student states a preference, or
the name of a topic they found hard. Never the whole message or document.
"""
import re

MAX_MEMORY_CHARS = 300
MAX_TOPIC_CHARS = 100

# First-person statements about how/when the student studies,
# e.g. "I prefer short sessions", "I study best in the morning",
# "my learning style is visual".
_PREFERENCE_RE = re.compile(
    r"\b(?:i|i'm|i am|i've)\b[^.!?\n]{0,40}?\b(?:"
    r"prefer|like to|love to|learn best|study best|work best|focus best|focus better|"
    r"usually study|tend to study|can only study|only have|"
    r"am a (?:visual|auditory|morning|night|evening)"
    r")\b"
    r"|\bmy (?:learning|study|studying) (?:style|preference|routine|habit)s?\b"
    r"|\b(?:i|i'm|i am)\b[^.!?\n]{0,20}?\b(?:visual|auditory|kinesthetic) learner\b",
    re.IGNORECASE,
)

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")

# Words in a summary that suggest the material was hard.
_DIFFICULTY_RE = re.compile(
    r"\b(?:difficult|difficulty|challenging|complex topic|commonly confused|"
    r"common (?:mistakes?|pitfalls?|misconceptions?)|tricky)\b",
    re.IGNORECASE,
)

_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$", re.MULTILINE)
_BOLD_LINE_RE = re.compile(r"^\s*\*\*(.+?)\*\*\s*:?\s*$", re.MULTILINE)
_GENERIC_HEADINGS = re.compile(
    r"^(?:summary|overview|key (?:concepts|points|takeaways)|revision checklist|"
    r"checklist|introduction|notes|lecture notes|conclusion|definitions(?: (?:&|and) formulas)?)\b",
    re.IGNORECASE,
)


def extract_preference(text: str) -> str | None:
    """Return the sentence in which the student states a study preference."""
    for sentence in _SENTENCE_SPLIT_RE.split(text or ""):
        sentence = sentence.strip()
        if sentence and _PREFERENCE_RE.search(sentence):
            return sentence[:MAX_MEMORY_CHARS]
    return None


def _clean_heading(value: str) -> str:
    value = re.sub(r"[*_`]+", "", value).strip(" :-–—")
    # Drop prefixes like "Summary:" / "Summary of"
    value = re.sub(r"^(?:summary|overview|notes)\s*(?:of|:|-|–|—)\s*", "", value, flags=re.IGNORECASE)
    return value.strip()


def summary_topic(summary: str, source: str = "") -> str | None:
    """Best-effort topic name for a summary: its first specific heading."""
    for pattern in (_HEADING_RE, _BOLD_LINE_RE):
        for match in pattern.finditer(summary or ""):
            heading = _clean_heading(match.group(1))
            if heading and not _GENERIC_HEADINGS.match(heading):
                return heading[:MAX_TOPIC_CHARS]
    # Fall back to the first line of the source document (often its title).
    first_line = next((line.strip() for line in (source or "").splitlines() if line.strip()), "")
    first_line = _clean_heading(first_line.split(". ")[0])
    return first_line[:MAX_TOPIC_CHARS] or None


_QUIZ_REQUEST_RE = re.compile(
    r"^\s*(?:/quiz|/mcq)?\s*(?:(?:can you |could you |please )*"
    r"(?:quiz me|test me|give me (?:a )?(?:quiz|test)|make (?:me )?(?:a )?quiz|"
    r"generate (?:a )?quiz|\d+ (?:mcqs?|questions))\b)?\s*(?:(?:on|about|over)\b)?\s*:?\s*",
    re.IGNORECASE,
)


def quiz_topic(request: str) -> str:
    """The subject of a quiz request: "Quiz me on: photosynthesis" -> "photosynthesis"."""
    topic = _QUIZ_REQUEST_RE.sub("", (request or "").strip(), count=1).strip(" .?!")
    return (topic or (request or "").strip() or "General")[:MAX_TOPIC_CHARS]


def weak_area_from_quiz(topic: str, score: int, total: int, missed: list[str]) -> str | None:
    """A weak-area note for a quiz with wrong answers, naming what was missed."""
    if not missed or score >= total:
        return None
    note = f"Weak area: {topic} (quiz score {score}/{total}). Missed: " + "; ".join(q.strip() for q in missed)
    return note[:MAX_MEMORY_CHARS]


def weak_subject_from_summary(summary: str, source: str = "") -> str | None:
    """A short "Challenging topic: X" note if the summary flags the material as hard."""
    if not _DIFFICULTY_RE.search(summary or ""):
        return None
    topic = summary_topic(summary, source)
    return f"Challenging topic: {topic}" if topic else None
