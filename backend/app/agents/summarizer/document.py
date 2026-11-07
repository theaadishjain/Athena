"""Whole-document summaries with source citations.

The document arrives split into segments (PDF pages, or line ranges for
TXT/MD), each tagged with a label like "p. 12". Small documents are
summarized in one call. Bigger ones are split into parts that are noted in
parallel (map) and then merged (reduce), so a 60-page PDF is read in full
without one giant, slow call. Citations the model invents for pages that
don't exist are removed afterwards.
"""
import asyncio
import logging
import re
import time
from typing import Any, List

from app.agents.shared.parsing import message_text

logger = logging.getLogger(__name__)

# One call up to ~30k tokens of text; above that, map-reduce.
SINGLE_PASS_CHARS = 120_000
CHUNK_CHARS = 30_000
MAP_CONCURRENCY = 8

SUMMARY_FORMAT = """Write the summary in Markdown with exactly these sections:

## Overview
Two or three sentences on what the document covers.

## Key concepts
Bullet points. End EVERY bullet with the source label(s) it comes from, e.g. {example}.

## Definitions & formulas
"**Term** — definition" bullets (formulas in LaTeX, $...$), each ending with its source label. Leave this section out if the document has none.

## Revision checklist
5–8 "- [ ] ..." items a student can tick off. No citations here.

Citation rules:
- Cite only labels that appear in the source, written exactly like {example}. For a point spanning neighbouring sections use {range_example}.
- Never invent or guess a label. If you are unsure where something came from, leave the point out.
- Always complete every section; never stop mid-sentence."""

SINGLE_PASS_PROMPT = """You are Athena's Summarizer. Summarize this document for a student revising for an exam.
The document is split into sections; each starts with its source label in square brackets, such as {example}.

{format}

What Athena already knows about the student (use only to choose emphasis, never cite it):
{memory_context}

DOCUMENT:
{document}"""

MAP_PROMPT = """You are taking notes on one part of a longer document for a student.
Each section starts with its source label in square brackets, such as {example}.

List the 6–12 most important points of THIS part: key ideas, definitions, formulas (in LaTeX) and facts likely to be examined.
One terse bullet per point, each ending with the source label(s) it comes from, written exactly like {example}.
Return only the bullets.

PART {part} of {parts}:
{document}"""

REDUCE_PROMPT = """You are Athena's Summarizer. Below are notes taken from each part of one document, in order.
Every note already ends with its source citation. Merge them into one summary for a student revising for an exam:
remove duplicates, group related points, and keep each point's citation exactly as written (combine citations when you merge points).

{format}

What Athena already knows about the student (use only to choose emphasis, never cite it):
{memory_context}

NOTES:
{notes}"""


def _examples(kind: str) -> dict:
    if kind == "lines":
        return {"example": "[L41–80]", "range_example": "[L41–120]"}
    return {"example": "[p. 12]", "range_example": "[pp. 12–13]"}


def render_segments(segments: List[dict]) -> str:
    return "\n\n".join(f"[{s['label']}]\n{s['text']}" for s in segments)


def chunk_segments(segments: List[dict], max_chars: int | None = None) -> List[List[dict]]:
    """Group consecutive segments into parts of at most ~max_chars."""
    max_chars = max_chars or CHUNK_CHARS
    chunks: List[List[dict]] = []
    current: List[dict] = []
    size = 0
    for segment in segments:
        length = len(segment["text"]) + len(segment["label"]) + 4
        if current and size + length > max_chars:
            chunks.append(current)
            current, size = [], 0
        current.append(segment)
        size += length
    if current:
        chunks.append(current)
    return chunks


_PAGE_CITE_RE = re.compile(r"\s?\[(?:pp?\.)\s*(\d+)(?:\s*[–—-]\s*(\d+))?\]")
_LINE_CITE_RE = re.compile(r"\s?\[L(\d+)(?:\s*[–—-]\s*L?(\d+))?\]")


def validate_citations(text: str, document: dict) -> str:
    """Drop citations pointing outside the document (invented page numbers)."""
    segments = document["segments"]
    if not segments:
        return text
    low = min(s["start"] for s in segments)
    high = max(s["end"] for s in segments)
    pattern = _LINE_CITE_RE if document["kind"] == "lines" else _PAGE_CITE_RE

    def check(match: re.Match) -> str:
        start = int(match.group(1))
        end = int(match.group(2) or start)
        if low <= start <= end <= high:
            return match.group(0)
        logger.info("Dropped out-of-range citation %r", match.group(0).strip())
        return ""

    return pattern.sub(check, text)


def truncation_note(document: dict) -> str:
    if not document.get("truncated"):
        return ""
    last = document["segments"][-1]["end"]
    unit = "lines" if document["kind"] == "lines" else "pages"
    return (
        f"\n\n> **Note:** this document is very long, so only {unit} 1–{last} "
        f"of {document['total_units']} were summarized."
    )


async def summarize_document(document: dict, memory_text: str, map_llm: Any, final_llm: Any) -> str:
    """Summarize every segment of `document`, citing source labels."""
    started = time.perf_counter()
    kind = document["kind"]
    examples = _examples(kind)
    summary_format = SUMMARY_FORMAT.format(**examples)
    segments = document["segments"]
    full_text = render_segments(segments)

    if len(full_text) <= SINGLE_PASS_CHARS:
        prompt = SINGLE_PASS_PROMPT.format(
            format=summary_format, memory_context=memory_text, document=full_text, **examples
        )
        summary = message_text(await final_llm.ainvoke(prompt))
        parts = 1
    else:
        chunks = chunk_segments(segments)
        parts = len(chunks)
        gate = asyncio.Semaphore(MAP_CONCURRENCY)

        async def take_notes(index: int, chunk: List[dict]) -> str:
            prompt = MAP_PROMPT.format(
                part=index + 1, parts=parts, document=render_segments(chunk), **examples
            )
            async with gate:
                notes = message_text(await map_llm.ainvoke(prompt)).strip()
            span = f"{chunk[0]['label']} to {chunk[-1]['label']}"
            return f"### Part {index + 1} ({span})\n{notes}"

        notes = await asyncio.gather(*(take_notes(i, c) for i, c in enumerate(chunks)))
        prompt = REDUCE_PROMPT.format(
            format=summary_format, memory_context=memory_text, notes="\n\n".join(notes), **examples
        )
        summary = message_text(await final_llm.ainvoke(prompt))

    summary = validate_citations(summary.strip(), document) + truncation_note(document)
    logger.info(
        "Summarized %d %s in %d part(s) in %.1fs",
        len(segments), kind, parts, time.perf_counter() - started,
    )
    return summary
