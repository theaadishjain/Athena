"""Flashcards from a whole uploaded document, each citing its source page.

Small documents go to the model in one call. Bigger ones are split into
parts, the requested number of cards is shared out between the parts in
proportion to their length, and the parts are generated in parallel, so
cards cover the whole document instead of its first few pages.
"""
import asyncio
import logging
import math
import re
from typing import Any, List

from app.agents.shared.parsing import clean_flashcards, message_text, parse_json_array
from app.agents.summarizer.document import CHUNK_CHARS, SINGLE_PASS_CHARS, chunk_segments, render_segments
from app.core.config import get_settings

logger = logging.getLogger(__name__)

DOCUMENT_FLASHCARD_PROMPT = """You are a study assistant making flashcards from {scope} of a student's document.
Each section starts with its source label in square brackets, such as {example}.

Generate exactly {count} flashcards on the most important, examinable ideas, definitions and formulas in it.
Spread them across the whole text you are given, not just its beginning. Keep answers to one or two sentences (formulas in LaTeX, $...$).

Return ONLY a valid JSON array with no markdown, no code blocks, no preamble:
[
  {{"question": "...", "answer": "...", "source": "{label_example}"}}
]
"source" is the label of the section the answer comes from, written exactly as shown but without the brackets.

What Athena knows about the student (use only to choose emphasis):
{memory_context}

TEXT:
{document}"""

STRICT_PREFIX = (
    "Your previous reply was not valid JSON. "
    "Return EXACTLY AND ONLY a raw JSON array. No markdown, no commentary.\n\n"
)


def allocate(count: int, sizes: List[int]) -> List[int]:
    """Share `count` cards between parts in proportion to their sizes.

    Uses largest remainders so the shares add up to exactly `count`, and gives
    every part at least one card when there are enough cards to go round.
    """
    if not sizes:
        return []
    total = sum(sizes) or 1
    raw = [count * s / total for s in sizes]
    shares = [math.floor(r) for r in raw]
    by_remainder = sorted(range(len(sizes)), key=lambda i: raw[i] - shares[i], reverse=True)
    for i in by_remainder[: count - sum(shares)]:
        shares[i] += 1
    if count >= len(sizes):
        for i, share in enumerate(shares):
            if share == 0:
                donor = max(range(len(shares)), key=lambda j: shares[j])
                shares[donor] -= 1
                shares[i] = 1
    return shares


_NUMBER_RE = re.compile(r"(\d+)")


def fix_source(source: str | None, document: dict) -> str | None:
    """Map a card's source to a real segment label, or drop it."""
    if not source:
        return None
    segments = document["segments"]
    labels = {s["label"] for s in segments}
    if source in labels:
        return source
    match = _NUMBER_RE.search(source)
    if not match:
        return None
    number = int(match.group(1))
    for segment in segments:
        if segment["start"] <= number <= segment["end"]:
            return segment["label"]
    return None


async def flashcards_from_document(document: dict, count: int, llm: Any, memory_text: str) -> List[dict]:
    segments = document["segments"]
    lines = document["kind"] == "lines"
    example = "[L41–80]" if lines else "[p. 12]"
    label_example = "L41–80" if lines else "p. 12"

    full_text = render_segments(segments)
    if len(full_text) <= SINGLE_PASS_CHARS:
        parts = [segments]
    else:
        # Never more parts than cards, so every part gets at least one.
        parts = chunk_segments(segments, max(CHUNK_CHARS, math.ceil(len(full_text) / count)))
    shares = allocate(count, [len(render_segments(p)) for p in parts])
    gate = asyncio.Semaphore(get_settings().llm_max_concurrency)

    async def generate(index: int, part: List[dict], share: int) -> List[dict]:
        if share <= 0:
            return []
        scope = "the whole" if len(parts) == 1 else f"part {index + 1} of {len(parts)} ({part[0]['label']} to {part[-1]['label']})"
        prompt = DOCUMENT_FLASHCARD_PROMPT.format(
            scope=scope, count=share, example=example, label_example=label_example,
            memory_context=memory_text, document=render_segments(part),
        )
        async with gate:
            for attempt in (prompt, STRICT_PREFIX + prompt):
                try:
                    cards = clean_flashcards(parse_json_array(message_text(await llm.ainvoke(attempt))))
                except ValueError:
                    cards = []
                if cards:
                    return cards[:share]
        # One bad part shouldn't sink the whole deck.
        logger.warning("No usable flashcards for part %d of %d", index + 1, len(parts))
        return []

    results = await asyncio.gather(*(generate(i, p, s) for i, (p, s) in enumerate(zip(parts, shares))))
    cards: List[dict] = []
    for card in (c for part_cards in results for c in part_cards):
        source = fix_source(card.get("source"), document)
        cards.append({"question": card["question"], "answer": card["answer"], **({"source": source} if source else {})})
    return cards[:count]
