import asyncio
import logging
import os
import tempfile
from pathlib import Path

from fastapi import HTTPException, UploadFile
from pypdf import PdfReader

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}

# Token safety cap for text sent to the LLM. Long-term fix: RAG chunking.
MAX_DOCUMENT_CHARS = 8000

_CHUNK_SIZE = 1024 * 1024


def preprocess_document(file_path: str) -> str:
    """Preprocess .pdf/.txt/.md files into clean plain text (capped).

    This module intentionally does not perform summarization.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError("Unsupported file type. Supported: .pdf, .txt, .md")

    if suffix in {".txt", ".md"}:
        text = path.read_text(encoding="utf-8", errors="replace")
    else:
        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(pages)

    extracted = " ".join(text.split()).strip()
    return extracted[:MAX_DOCUMENT_CHARS]


async def extract_upload_text(file: UploadFile) -> str:
    """Validate an uploaded document and return its text.

    Checks the extension before touching the data, streams the upload to a
    temp file with a size limit, and parses it off the event loop. Raises
    HTTPException with a user-facing message on any problem.
    """
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
            text = await asyncio.to_thread(preprocess_document, tmp_path)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception:
            logger.exception("Failed to process uploaded file")
            raise HTTPException(status_code=500, detail="Failed to process file")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

    if not text:
        raise HTTPException(
            status_code=400,
            detail="No readable text found in this file. Scanned PDFs (images of pages) aren't supported yet.",
        )
    return text
