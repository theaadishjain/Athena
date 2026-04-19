from pathlib import Path

from pypdf import PdfReader


SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}


def preprocess_document(file_path: str) -> str:
    """Preprocess .pdf/.txt/.md files into clean plain text.

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
    return extracted[:8000]
    # Token safety cap. Increase for longer docs.
    # Long-term fix: RAG chunking.
