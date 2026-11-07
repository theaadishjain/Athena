import asyncio
import logging
import os
import tempfile
from pathlib import Path
from typing import Callable, TypedDict, TypeVar

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}

# Cap for the plain-text path (/extract, used by the Flashcards page).
MAX_DOCUMENT_CHARS = 8000

# Caps for whole-document summaries. A 60-page lecture PDF is usually
# 100k-200k characters, well inside these; they only bound cost on huge files.
MAX_DOCUMENT_PAGES = 300
MAX_FULL_DOCUMENT_CHARS = 400_000

# TXT/MD files have no pages, so they are cited by line range instead.
TEXT_SEGMENT_LINES = 40
TEXT_SEGMENT_CHARS = 3000

_CHUNK_SIZE = 1024 * 1024

T = TypeVar("T")


class Segment(TypedDict):
    """A citable slice of a document: one PDF page, or a range of lines."""
    label: str   # what the summary cites, e.g. "p. 12" or "L41–80"
    start: int   # first page / line (1-based)
    end: int     # last page / line (inclusive)
    text: str


class ParsedDocument(TypedDict):
    kind: str            # "pages" or "lines"
    segments: list[Segment]
    truncated: bool      # True when the caps above cut the document short
    total_units: int     # pages (or lines) in the original file


def _check_suffix(file_path: str) -> str:
    suffix = Path(file_path).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError("Unsupported file type. Supported: .pdf, .txt, .md")
    return suffix


def preprocess_document(file_path: str) -> str:
    """Preprocess .pdf/.txt/.md files into clean plain text (capped).

    This module intentionally does not perform summarization.
    """
    path = Path(file_path)
    suffix = _check_suffix(file_path)

    if suffix in {".txt", ".md"}:
        text = path.read_text(encoding="utf-8", errors="replace")
    else:
        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(pages)

    extracted = " ".join(text.split()).strip()
    return extracted[:MAX_DOCUMENT_CHARS]


def parse_document(file_path: str) -> ParsedDocument:
    """Split a whole document into citable segments (no 8k cap)."""
    suffix = _check_suffix(file_path)
    segments: list[Segment] = []
    used = 0
    truncated = False

    if suffix == ".pdf":
        reader = PdfReader(file_path)
        total = len(reader.pages)
        for number, page in enumerate(reader.pages, start=1):
            if number > MAX_DOCUMENT_PAGES or used >= MAX_FULL_DOCUMENT_CHARS:
                truncated = True
                break
            text = " ".join((page.extract_text() or "").split())
            if not text:
                continue  # blank or image-only page
            text = text[: MAX_FULL_DOCUMENT_CHARS - used]
            used += len(text)
            segments.append({"label": f"p. {number}", "start": number, "end": number, "text": text})
        return {"kind": "pages", "segments": segments, "truncated": truncated, "total_units": total}

    lines = Path(file_path).read_text(encoding="utf-8", errors="replace").splitlines()
    buffer: list[str] = []
    first = 1
    size = 0

    def flush(last: int) -> None:
        nonlocal buffer, size, used
        text = "\n".join(line for line in buffer if line).strip()
        if text:
            text = text[: MAX_FULL_DOCUMENT_CHARS - used]
            used += len(text)
            label = f"L{first}" if first == last else f"L{first}–{last}"
            segments.append({"label": label, "start": first, "end": last, "text": text})
        buffer, size = [], 0

    for number, line in enumerate(lines, start=1):
        if used >= MAX_FULL_DOCUMENT_CHARS:
            truncated = True
            break
        if not buffer:
            first = number
        buffer.append(line.strip())
        size += len(line)
        if len(buffer) >= TEXT_SEGMENT_LINES or size >= TEXT_SEGMENT_CHARS:
            flush(number)
    else:
        if buffer:
            flush(len(lines))
    return {"kind": "lines", "segments": segments, "truncated": truncated, "total_units": len(lines)}


async def _parse_upload(file: UploadFile, parse: Callable[[str], T]) -> T:
    """Validate an upload, stream it to a temp file with a size limit, and run
    `parse` on it off the event loop. Raises user-facing HTTPExceptions."""
    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file type. Supported: .pdf, .txt, .md")

    max_mb = get_settings().max_upload_mb
    max_bytes = max_mb * 1024 * 1024
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            written = 0
            while chunk := await file.read(_CHUNK_SIZE):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {max_mb} MB.")
                tmp.write(chunk)

        try:
            # PDF parsing is CPU-bound; keep it off the event loop.
            return await asyncio.to_thread(parse, tmp_path)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception:
            logger.exception("Failed to process uploaded file")
            raise HTTPException(status_code=500, detail="Failed to process file")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


_NO_TEXT = "No readable text found in this file. Scanned PDFs (images of pages) aren't supported yet."


async def extract_upload_text(file: UploadFile) -> str:
    """Return an upload's plain text, capped at MAX_DOCUMENT_CHARS."""
    text = await _parse_upload(file, preprocess_document)
    if not text:
        raise HTTPException(status_code=400, detail=_NO_TEXT)
    return text


async def extract_upload_document(file: UploadFile) -> ParsedDocument:
    """Return an upload split into citable pages / line ranges."""
    document = await _parse_upload(file, parse_document)
    if not document["segments"]:
        raise HTTPException(status_code=400, detail=_NO_TEXT)
    return document
