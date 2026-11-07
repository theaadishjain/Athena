"""Whole-document summaries with citations, and quiz scores that feed weak areas."""
import json
import uuid

import pytest

from app.agents.shared.memory_rules import quiz_topic, weak_area_from_quiz
from app.agents.summarizer import document as doc
from app.services import ingest


# ── helpers ──────────────────────────────────────────────────

def make_pdf_pages(pages: list[str]) -> bytes:
    """A valid PDF with one text line per page ('' makes a blank page)."""
    n = len(pages)
    font_id = 3 + 2 * n
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [%s] /Count %d >>"
        % (b" ".join(b"%d 0 R" % (3 + 2 * i) for i in range(n)), n),
    ]
    for i, text in enumerate(pages):
        objects.append(
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>" % (font_id, 4 + 2 * i)
        )
        stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode() if text else b""
        objects.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


def summarize(client, name: str, data: bytes, mime: str = "application/pdf"):
    return client.post("/summarize", data={"session_id": str(uuid.uuid4())}, files={"file": (name, data, mime)})


# ── document parsing ─────────────────────────────────────────

def test_pdf_is_split_into_cited_pages(tmp_path):
    path = tmp_path / "l.pdf"
    path.write_bytes(make_pdf_pages(["Intro to graphs", "", "BFS uses a queue"]))
    parsed = ingest.parse_document(str(path))

    assert parsed["kind"] == "pages"
    assert parsed["total_units"] == 3
    assert [s["label"] for s in parsed["segments"]] == ["p. 1", "p. 3"]  # blank page 2 skipped
    assert "BFS uses a queue" in parsed["segments"][1]["text"]


def test_text_files_are_cited_by_line_range(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "TEXT_SEGMENT_LINES", 3)
    path = tmp_path / "n.md"
    path.write_text("\n".join(f"line {i}" for i in range(1, 8)), encoding="utf-8")
    parsed = ingest.parse_document(str(path))

    assert parsed["kind"] == "lines"
    assert [s["label"] for s in parsed["segments"]] == ["L1–3", "L4–6", "L7"]


def test_invented_citations_are_removed():
    document = {"kind": "pages", "segments": [
        {"label": "p. 1", "start": 1, "end": 1, "text": "a"},
        {"label": "p. 4", "start": 4, "end": 4, "text": "b"},
    ]}
    text = "- BFS [p. 1]\n- DFS [pp. 3–4]\n- Made up [p. 9]\n- Range out [pp. 4–6]"
    assert doc.validate_citations(text, document) == "- BFS [p. 1]\n- DFS [pp. 3–4]\n- Made up\n- Range out"

    lines = {"kind": "lines", "segments": [{"label": "L1–40", "start": 1, "end": 40, "text": "x"}]}
    assert doc.validate_citations("ok [L1–40] bad [L50–60]", lines) == "ok [L1–40] bad"


def test_chunks_keep_whole_segments_in_order():
    segments = [{"label": f"p. {i}", "start": i, "end": i, "text": "x" * 40} for i in range(1, 8)]
    chunks = doc.chunk_segments(segments, max_chars=100)
    assert [[s["start"] for s in c] for c in chunks] == [[1, 2], [3, 4], [5, 6], [7]]


# ── /summarize ───────────────────────────────────────────────

def test_summary_reads_past_the_old_8000_char_cap(client, harness):
    filler = "Graphs are made of vertices and edges " * 40  # ~1.5k chars per page
    pages = [filler] * 9 + ["Dijkstra relaxes edges in order of distance"]
    harness.use_replies(summarizer=["## Key concepts\n- Dijkstra uses a priority queue [p. 10]\n- Invented [p. 42]"])

    r = summarize(client, "lecture.pdf", make_pdf_pages(pages))

    assert r.status_code == 200, r.text
    prompt = harness.models["summarizer"].prompts[-1]
    assert len(prompt) > ingest.MAX_DOCUMENT_CHARS
    assert "[p. 10]\nDijkstra relaxes edges" in prompt  # the last page reached the model, labelled
    body = r.json()["response"]
    assert "[p. 10]" in body
    assert "[p. 42]" not in body  # page 42 doesn't exist


def test_big_documents_are_noted_in_parallel_then_merged(client, harness, monkeypatch):
    monkeypatch.setattr(doc, "SINGLE_PASS_CHARS", 500)
    monkeypatch.setattr(doc, "CHUNK_CHARS", 300)
    pages = [f"Topic {i} " * 30 for i in range(1, 7)]  # ~240 chars a page -> one page per part
    harness.use_replies(summarizer=["- a point [p. 1]"] * 6 + ["## Overview\nMerged [pp. 1–6]"])

    r = summarize(client, "big.pdf", make_pdf_pages(pages))

    assert r.status_code == 200, r.text
    prompts = harness.models["summarizer"].prompts
    assert len(prompts) == 7  # 6 part notes + 1 merge
    assert sum("PART" in p for p in prompts) == 6
    assert "### Part 6 (p. 6 to p. 6)" in prompts[-1]
    assert r.json()["response"] == "## Overview\nMerged [pp. 1–6]"


def test_very_long_documents_say_what_was_summarized(client, harness, monkeypatch):
    monkeypatch.setattr(ingest, "MAX_DOCUMENT_PAGES", 2)
    harness.use_replies(summarizer=["## Overview\nShort [p. 1]"])
    r = summarize(client, "long.pdf", make_pdf_pages(["one", "two", "three", "four"]))
    assert "only pages 1–2 of 4 were summarized" in r.json()["response"]


def test_scanned_pdfs_are_rejected(client, harness):
    harness.use_replies()
    r = summarize(client, "scan.pdf", make_pdf_pages(["", ""]))
    assert r.status_code == 400
    assert "Scanned PDFs" in r.json()["detail"]


# ── quiz results & weak areas ────────────────────────────────

@pytest.mark.parametrize("request_text, topic", [
    ("Quiz me on: photosynthesis", "photosynthesis"),
    ("quiz me on photosynthesis?", "photosynthesis"),
    ("/quiz binary trees", "binary trees"),
    ("Can you quiz me about the Krebs cycle", "the Krebs cycle"),
    ("Ontology basics", "Ontology basics"),
])
def test_quiz_topic(request_text, topic):
    assert quiz_topic(request_text) == topic


def test_weak_area_note_names_missed_questions():
    assert weak_area_from_quiz("photosynthesis", 5, 5, []) is None
    note = weak_area_from_quiz("photosynthesis", 3, 5, ["Where does the Calvin cycle happen?", "What splits water?"])
    assert note == ("Weak area: photosynthesis (quiz score 3/5). Missed: "
                    "Where does the Calvin cycle happen?; What splits water?")
    assert len(weak_area_from_quiz("x", 0, 50, ["q" * 100] * 50)) <= 300


def test_quiz_score_is_saved_and_becomes_a_weak_area(client, harness):
    harness.use_replies()
    r = client.post("/quiz/results", json={
        "topic": "Quiz me on: photosynthesis", "score": 3, "total": 5,
        "missed": [{"question": "What splits water?", "correct_answer": "B. Photosystem II"}],
    })
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "saved", "topic": "photosynthesis", "weak_area_recorded": True}

    weak = [c for _, kind, c in harness.memory.writes if kind == "weak_subjects"]
    assert weak == ["Weak area: photosynthesis (quiz score 3/5). Missed: What splits water?"]

    results = client.get("/quiz/results").json()
    assert results[0]["topic"] == "photosynthesis"
    assert (results[0]["score"], results[0]["total"]) == (3, 5)
    assert results[0]["missed"][0]["correct_answer"] == "B. Photosystem II"


def test_perfect_quiz_adds_no_weak_area(client, harness):
    harness.use_replies()
    r = client.post("/quiz/results", json={"topic": "graphs", "score": 5, "total": 5})
    assert r.json()["weak_area_recorded"] is False
    assert not [w for w in harness.memory.writes if w[1] == "weak_subjects"]


def test_quiz_results_are_validated_and_private(client, harness):
    harness.use_replies()
    assert client.post("/quiz/results", json={"topic": "t", "score": 6, "total": 5}).status_code == 422
    too_many = [{"question": "q"}] * 3
    assert client.post("/quiz/results", json={"topic": "t", "score": 4, "total": 5, "missed": too_many}).status_code == 422

    client.post("/quiz/results", json={"topic": "mine", "score": 1, "total": 5})
    from app.core.auth import get_current_user
    from app.main import app
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    assert client.get("/quiz/results").json() == []


def test_quiz_agent_targets_weak_areas(client, harness):
    quiz = [{"question": "Where does the Calvin cycle run?", "options": ["A. Stroma", "B. Thylakoid"], "correct": "A"}]
    harness.use_replies(quiz=[json.dumps(quiz)])
    harness.memory.seeded["weak_subjects"] = ["Weak area: photosynthesis (quiz score 2/5). Missed: Calvin cycle location"]

    with client.stream("POST", "/chat", json={"session_id": str(uuid.uuid4()), "input": "quiz me on what I'm weak at"}) as r:
        events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]

    assert events[-1]["agent"] == "quiz"
    prompt = harness.models["quiz"].prompts[0]
    assert "- Weak area: photosynthesis (quiz score 2/5). Missed: Calvin cycle location" in prompt
    assert "build every question from the weak areas" in prompt


# ── flashcards from a whole document ─────────────────────────

from app.agents.flashcard import document as fdoc  # noqa: E402


def flashcards_from_file(client, name, data, count=10, mime="application/pdf"):
    return client.post(
        "/flashcards/document",
        data={"session_id": str(uuid.uuid4()), "count": str(count)},
        files={"file": (name, data, mime)},
    )


@pytest.mark.parametrize("count, sizes, expected", [
    (10, [100], [10]),
    (10, [300, 100, 100], [6, 2, 2]),
    (20, [1, 1, 1], [7, 7, 6]),
    (3, [1000, 1, 1], [1, 1, 1]),  # every part gets a card when there are enough
])
def test_cards_are_shared_out_by_part_size(count, sizes, expected):
    shares = fdoc.allocate(count, sizes)
    assert shares == expected
    assert sum(shares) == count


def test_card_sources_are_checked_against_the_document():
    document = {"kind": "pages", "segments": [
        {"label": "p. 2", "start": 2, "end": 2, "text": "a"},
        {"label": "p. 5", "start": 5, "end": 5, "text": "b"},
    ]}
    assert fdoc.fix_source("p. 5", document) == "p. 5"
    assert fdoc.fix_source("page 2", document) == "p. 2"
    assert fdoc.fix_source("p. 9", document) is None
    assert fdoc.fix_source(None, document) is None
    lines = {"kind": "lines", "segments": [{"label": "L41–80", "start": 41, "end": 80, "text": "x"}]}
    assert fdoc.fix_source("L50", lines) == "L41–80"


def test_flashcards_use_the_whole_file_and_cite_pages(client, harness):
    filler = "Graphs are made of vertices and edges " * 40
    pages = [filler] * 9 + ["Dijkstra relaxes edges in order of distance"]
    cards = [
        {"question": "What does Dijkstra relax first?", "answer": "The closest edge", "source": "p. 10"},
        {"question": "What is a graph?", "answer": "Vertices and edges", "source": "p. 99"},
    ]
    harness.use_replies(flashcard=[json.dumps(cards)])

    r = flashcards_from_file(client, "lecture.pdf", make_pdf_pages(pages), count=2)

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "success" and body["agent"] == "flashcard"
    assert body["flashcards"][0] == {"question": "What does Dijkstra relax first?", "answer": "The closest edge", "source": "p. 10"}
    assert body["flashcards"][1]["source"] is None  # page 99 doesn't exist
    prompt = harness.models["flashcard"].prompts[0]
    assert len(prompt) > ingest.MAX_DOCUMENT_CHARS
    assert "[p. 10]\nDijkstra relaxes edges" in prompt
    assert "Generate exactly 2 flashcards" in prompt


def test_long_files_get_cards_from_every_part(client, harness, monkeypatch):
    monkeypatch.setattr(fdoc, "SINGLE_PASS_CHARS", 500)
    monkeypatch.setattr(fdoc, "CHUNK_CHARS", 300)
    pages = [f"Topic {i} " * 30 for i in range(1, 5)]  # 4 parts of one page
    card = [{"question": "Q", "answer": "A", "source": "p. 1"}] * 3
    harness.use_replies(flashcard=[json.dumps(card)])

    r = flashcards_from_file(client, "big.pdf", make_pdf_pages(pages), count=8)

    prompts = harness.models["flashcard"].prompts
    assert len(prompts) == 4
    assert sorted(p.split("Generate exactly ")[1].split(" ")[0] for p in prompts) == ["2", "2", "2", "2"]
    assert all("part " in p for p in prompts)
    assert len(r.json()["flashcards"]) == 8


def test_flashcard_file_upload_is_validated(client, harness):
    harness.use_replies()
    assert flashcards_from_file(client, "x.exe", b"MZ", mime="application/octet-stream").status_code == 400
    assert flashcards_from_file(client, "n.txt", b"notes", count=0, mime="text/plain").status_code == 422
    assert flashcards_from_file(client, "n.txt", b"notes", count=51, mime="text/plain").status_code == 422
