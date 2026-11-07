import json
import pathlib
import uuid
from datetime import datetime


def read_stream(response) -> tuple[str, dict]:
    tokens, done = [], None
    for line in response.iter_lines():
        if not line.startswith("data: "):
            continue
        event = json.loads(line[6:])
        if event["type"] == "token":
            tokens.append(event["content"])
        elif event["type"] == "done":
            done = event
    assert done is not None, "stream ended without a done event"
    done["_token_events"] = len(tokens)
    return "".join(tokens), done


def chat(client, session_id, text, persist=True):
    with client.stream("POST", "/chat", json={"session_id": session_id, "input": text, "persist": persist}) as r:
        assert r.status_code == 200
        return read_stream(r)


def new_session(client) -> str:
    return client.post("/sessions").json()["id"]


def test_advisor_streams_real_tokens(client, harness):
    harness.use_replies(advisor=["BRIEF mode: Eigenvectors keep their direction under a linear map."])
    sid = new_session(client)
    streamed, done = chat(client, sid, "explain eigenvectors")

    assert done["agent"] == "advisor"
    assert done["streamed"] is True
    assert done["_token_events"] > 3  # arrives in pieces, not one blob
    assert streamed == "Eigenvectors keep their direction under a linear map."
    assert done["content"] == streamed  # mode label stripped in both
    assert done["fallback"] is False


def test_history_is_sent_to_the_model(client, harness):
    harness.use_replies(advisor=["A binary tree has at most two children.", "Here is an example."])
    sid = new_session(client)
    chat(client, sid, "explain binary trees")
    chat(client, sid, "explain more with an example")

    second_prompt = harness.models["advisor"].prompts[1]
    assert "Student: explain binary trees" in second_prompt
    assert "Athena: A binary tree has at most two children." in second_prompt


def test_messages_are_persisted_with_flashcards(client, harness):
    cards = [{"question": "Q1", "answer": "A1"}, {"question": "Q2", "answer": "A2"}]
    harness.use_replies(flashcard=["```json\n" + json.dumps(cards) + "\n```"])
    sid = new_session(client)
    streamed, done = chat(client, sid, "make flashcards on graphs")

    assert done["agent"] == "flashcard"
    assert done["flashcards"] == cards
    assert streamed == ""  # JSON is never streamed to the user
    assert done["content"].startswith("Here are your 2 flashcards")
    # Fenced JSON parses on the first try: no paid retry.
    assert len(harness.models["flashcard"].prompts) == 1

    msgs = client.get(f"/sessions/{sid}/messages").json()
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert msgs[1]["flashcards"] == cards
    assert msgs[0]["created_at"].endswith("Z")

    sessions = client.get("/sessions").json()
    assert sessions[0]["title"] == "make flashcards on graphs"


def test_quiz_is_returned_and_normalized(client, harness):
    quiz = [{"question": "2+2?", "options": ["A. 3", "B. 4"], "correct": "B. 4", "explanation": "math"}]
    harness.use_replies(quiz=["Here you go:\n" + json.dumps(quiz)])
    sid = new_session(client)
    _, done = chat(client, sid, "quiz me on arithmetic")

    assert done["agent"] == "quiz"
    assert done["quiz"][0]["correct"] == "B"
    assert client.get(f"/sessions/{sid}/messages").json()[1]["quiz"][0]["correct"] == "B"


def test_flashcard_retry_then_fallback(client, harness):
    harness.use_replies(flashcard=["not json", "still not json"])
    sid = new_session(client)
    _, done = chat(client, sid, "make flashcards on graphs")

    assert done["fallback"] is True
    assert done["content"] == "Could not generate flashcards. Please try again."
    assert len(harness.models["flashcard"].prompts) == 2


def test_persist_false_creates_no_session(client, harness):
    harness.use_replies(flashcard=['[{"question": "Q", "answer": "A"}]'])
    _, done = chat(client, str(uuid.uuid4()), "Generate 10 flashcards on the topic: sets", persist=False)
    assert done["flashcards"] == [{"question": "Q", "answer": "A"}]
    assert client.get("/sessions").json() == []


def test_cannot_chat_in_another_users_session(client, harness):
    harness.use_replies()
    sid = new_session(client)
    harness.user_id = f"other_{uuid.uuid4().hex[:8]}"
    r = client.post("/chat", json={"session_id": sid, "input": "hi"})
    assert r.status_code == 403
    assert client.get(f"/sessions/{sid}/messages").status_code == 404


def test_notes_are_scoped_to_owner(client, harness):
    harness.use_replies()
    sid = new_session(client)
    assert client.post(f"/sessions/{sid}/notes", json={"filename": "a.pdf", "summary": "s"}).status_code == 200

    harness.user_id = f"other_{uuid.uuid4().hex[:8]}"
    r = client.post(f"/sessions/{sid}/notes", json={"filename": "x", "summary": "injected"})
    assert r.status_code == 403
    assert client.get("/sessions/notes/all").json() == []


def test_save_message_validates_payload(client, harness):
    harness.use_replies()
    sid = new_session(client)
    assert client.post(f"/sessions/{sid}/messages", json={"content": "no role"}).status_code == 422
    assert client.post(f"/sessions/{sid}/messages", json={"role": "system", "content": "x"}).status_code == 422
    assert client.post(f"/sessions/{sid}/messages", json={"role": "user", "content": "ok"}).status_code == 200


def test_timestamps_are_utc(client, harness):
    harness.use_replies()
    new_session(client)
    created = client.get("/sessions").json()[0]["created_at"]
    assert created.endswith("Z")
    assert datetime.fromisoformat(created.replace("Z", "+00:00")).tzinfo is not None


def test_plan_saved_once(client, harness):
    harness.use_replies(planner=["Day 1: trees. Day 2: graphs."])
    sid = new_session(client)
    r = client.post("/plan", json={"session_id": sid, "input": "plan for my DS exam"})
    assert r.status_code == 200
    assert r.json()["response"] == "Day 1: trees. Day 2: graphs."
    notes = client.get("/sessions/notes/all").json()
    assert [n["filename"] for n in notes] == ["Study Plan"]


def test_summarize_rejects_bad_uploads(client, harness, monkeypatch):
    harness.use_replies(summarizer=["Key concepts: ..."])
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "max_upload_mb", 1)

    r = client.post("/summarize", data={"session_id": "s"}, files={"file": ("x.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 400

    big = b"a" * (1024 * 1024 + 10)
    r = client.post("/summarize", data={"session_id": "s"}, files={"file": ("big.txt", big, "text/plain")})
    assert r.status_code == 413

    notes = (pathlib.Path(__file__).parent / "fixtures" / "graph_traversal_notes.txt").read_bytes()
    r = client.post("/summarize", data={"session_id": "s"}, files={"file": ("notes.txt", notes, "text/plain")})
    assert r.status_code == 200
    assert r.json()["response"] == "Key concepts: ..."
    assert "BFS" in harness.models["summarizer"].prompts[-1]  # extracted text reached the model


def test_memory_routes_ignore_client_user_id(client, harness):
    harness.use_replies()
    assert client.get("/memory", params={"memory_type": "past_chats"}).status_code == 200
    r = client.post("/memory", json={"memory_type": "preferences", "content": "mornings", "user_id": "spoofed"})
    assert r.json()["user_id"] == harness.user_id


def make_pdf(text: str) -> bytes:
    """Smallest valid one-page PDF containing `text` (with a correct xref)."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


def test_extract_reads_pdf_text(client, harness):
    harness.use_replies()
    pdf = make_pdf("Dijkstra finds shortest paths")
    r = client.post("/extract", files={"file": ("lecture.pdf", pdf, "application/pdf")})
    assert r.status_code == 200, r.text
    assert "Dijkstra finds shortest paths" in r.json()["text"]


def test_extract_validates_like_summarize(client, harness):
    harness.use_replies()
    assert client.post("/extract", files={"file": ("x.docx", b"PK", "application/octet-stream")}).status_code == 400
    assert client.post("/extract", files={"file": ("empty.txt", b"   ", "text/plain")}).status_code == 400


def test_flashcards_from_pdf_use_document_text(client, harness):
    """End to end: what the Flashcards page does in file mode."""
    harness.use_replies(flashcard=['[{"question": "What does Dijkstra find?", "answer": "Shortest paths"}]'])
    text = client.post("/extract", files={"file": ("l.pdf", make_pdf("Dijkstra finds shortest paths"), "application/pdf")}).json()["text"]
    _, done = chat(client, str(uuid.uuid4()), f"Generate 10 flashcards from these notes: {text}", persist=False)
    assert done["agent"] == "flashcard"
    assert "Dijkstra finds shortest paths" in harness.models["flashcard"].prompts[0]


def test_deleting_a_chat_keeps_its_notes(client, harness):
    harness.use_replies(planner=["Day 1: graphs"])
    sid = new_session(client)
    client.post(f"/sessions/{sid}/notes", json={"filename": "lecture.pdf", "summary": "BFS uses a queue"})
    client.post("/plan", json={"session_id": sid, "input": "plan my graphs exam"})
    chat(client, sid, "explain BFS")

    assert client.delete(f"/sessions/{sid}").status_code == 200
    assert client.get(f"/sessions/{sid}/messages").status_code == 404
    titles = sorted(n["filename"] for n in client.get("/sessions/notes/all").json())
    assert titles == ["Study Plan", "lecture.pdf"]


def test_memory_writes_are_short_and_specific(client, harness):
    harness.use_replies(
        advisor=["A linked list is a chain of nodes.", "Sure."],
        summarizer=["# Graph Traversal\nBFS vs DFS is commonly confused."],
    )
    sid = new_session(client)
    chat(client, sid, "what does a linked list look like?")
    chat(client, sid, "Got it. I prefer short examples. Can you show one?")
    notes = (pathlib.Path(__file__).parent / "fixtures" / "graph_traversal_notes.txt").read_bytes()
    client.post("/summarize", data={"session_id": sid}, files={"file": ("n.txt", notes, "text/plain")})

    writes = {(kind, content) for _, kind, content in harness.memory.writes}
    prefs = [c for k, c in writes if k == "preferences"]
    weak = [c for k, c in writes if k == "weak_subjects"]
    assert prefs == ["I prefer short examples."]
    assert weak == ["Challenging topic: Graph Traversal"]
