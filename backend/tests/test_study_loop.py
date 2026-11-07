"""Spaced repetition, real dashboard stats, and a planner that uses weak
areas and an uploaded syllabus."""
import uuid
from datetime import date, datetime, timedelta

import pytest

from app.api import reviews as reviews_api
from app.api.stats import study_streak
from app.services.spaced_repetition import DEFAULT_EASE, MIN_EASE, RELEARN_AFTER, Schedule, review

NOW = datetime(2026, 11, 7, 12, 0)


# ── SM-2 ─────────────────────────────────────────────────────

def test_got_it_grows_the_interval_1_6_then_times_ease():
    card, due = review(Schedule(), "got_it", NOW)
    assert (card.repetitions, card.interval_days, due) == (1, 1, NOW + timedelta(days=1))
    card, due = review(card, "got_it", NOW)
    assert card.interval_days == 6
    card, due = review(card, "got_it", NOW)
    assert card.interval_days == round(6 * DEFAULT_EASE)  # 15 days
    assert card.ease == pytest.approx(DEFAULT_EASE)  # "got it" keeps the ease


def test_missed_cards_come_back_soon_and_more_often():
    card, _ = review(Schedule(), "got_it", NOW)
    card, _ = review(card, "got_it", NOW)
    missed, due = review(card, "missed", NOW)
    assert due == NOW + RELEARN_AFTER  # back within minutes
    assert (missed.repetitions, missed.interval_days, missed.lapses) == (0, 0, 1)
    assert missed.ease < DEFAULT_EASE  # shorter intervals from now on

    for _ in range(10):
        missed, _ = review(missed, "missed", NOW)
    assert missed.ease == MIN_EASE


# ── /reviews ─────────────────────────────────────────────────

def grade(client, grade, **card):
    body = {"grade": grade}
    if "card_id" in card:
        body["card_id"] = card["card_id"]
    else:
        body["card"] = {"question": "Q?", "answer": "A", "source": "p. 3", "deck": "Graphs", **card}
    return client.post("/reviews/grade", json=body)


def test_first_grade_adds_the_card_to_the_schedule(client, harness):
    harness.use_replies()
    r = grade(client, "got_it", question="What does BFS use?", answer="A queue")
    assert r.status_code == 200, r.text
    card = r.json()
    assert card["interval_days"] == 1 and card["source"] == "p. 3" and card["deck"] == "Graphs"

    # Grading the same question again updates that card instead of duplicating it.
    again = grade(client, "got_it", question="What does BFS use?", answer="A queue").json()
    assert again["id"] == card["id"] and again["interval_days"] == 6


def test_due_list_puts_missed_cards_first(client, harness, monkeypatch):
    harness.use_replies()
    easy = grade(client, "got_it", question="Easy one").json()
    hard = grade(client, "missed", question="Hard one").json()
    grade(client, "missed", card_id=hard["id"])  # missed twice

    assert client.get("/reviews/due").json()["due_count"] == 0  # nothing due yet

    later = reviews_api.utc_now() + timedelta(days=2)
    monkeypatch.setattr(reviews_api, "utc_now", lambda: later)
    due = client.get("/reviews/due").json()
    assert due["due_count"] == 2 and due["total"] == 2
    assert [c["id"] for c in due["cards"]] == [hard["id"], easy["id"]]  # missed one is most overdue
    assert due["cards"][0]["lapses"] == 2


def test_reviews_are_private_and_validated(client, harness):
    harness.use_replies()
    card = grade(client, "got_it", question="Mine").json()
    assert client.post("/reviews/grade", json={"grade": "got_it"}).status_code == 422
    assert client.post("/reviews/grade", json={"grade": "maybe", "card_id": card["id"]}).status_code == 422

    from app.core.auth import get_current_user
    from app.main import app
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    assert grade(client, "got_it", card_id=card["id"]).status_code == 404
    assert client.get("/reviews/due").json()["total"] == 0


# ── /stats ───────────────────────────────────────────────────

def test_streak_counts_consecutive_days():
    today = date(2026, 11, 7)
    days = {today, today - timedelta(days=1), today - timedelta(days=2), today - timedelta(days=4)}
    assert study_streak(days, today) == 3
    assert study_streak(days - {today}, today) == 2  # not broken before today's session
    assert study_streak(set(), today) == 0


def test_stats_are_real_numbers(client, harness):
    harness.use_replies(advisor=["a", "b"], quiz=['[{"question": "q", "options": ["A. x", "B. y"], "correct": "A"}]'])
    sid = client.post("/sessions").json()["id"]
    for text in ("explain graphs", "explain trees", "quiz me on trees"):
        with client.stream("POST", "/chat", json={"session_id": sid, "input": text}) as r:
            list(r.iter_lines())
    client.post("/quiz/results", json={"topic": "quiz me on trees", "score": 4, "total": 5})
    grade(client, "missed", question="Due soon")

    stats = client.get("/stats", params={"tz_offset_minutes": -330}).json()

    assert stats["agent_counts"] == {"advisor": 2, "planner": 0, "summarizer": 0, "flashcard": 0, "quiz": 1}
    assert stats["streak_days"] == 1 and stats["studied_today"] is True
    assert stats["recent_quizzes"][0]["topic"] == "trees"
    assert (stats["recent_quizzes"][0]["score"], stats["recent_quizzes"][0]["total"]) == (4, 5)
    assert stats["review_cards"] == 1 and stats["reviews_due"] == 0


# ── Planner ──────────────────────────────────────────────────

def test_planner_prioritises_weak_areas(client, harness):
    harness.use_replies(planner=["Day 1: Dijkstra"])
    harness.memory.seeded["weak_subjects"] = ["Weak area: Dijkstra's algorithm (quiz score 2/5). Missed: negative edges"]
    r = client.post("/plan", json={"session_id": str(uuid.uuid4()), "input": "plan my graphs exam in 3 days"})
    assert r.status_code == 200
    prompt = harness.models["planner"].prompts[0]
    assert "- Weak area: Dijkstra's algorithm (quiz score 2/5)" in prompt
    assert "Give these topics extra time" in prompt


def test_plan_from_an_uploaded_syllabus(client, harness):
    harness.use_replies(planner=["Week 1: sorting"])
    syllabus = b"Week 1: Sorting algorithms\nWeek 2: Graphs and BFS\nMidterm: Week 3"
    r = client.post(
        "/plan/syllabus",
        data={"session_id": str(uuid.uuid4()), "input": "Plan my midterm prep in 4 sessions"},
        files={"file": ("syllabus.txt", syllabus, "text/plain")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["response"] == "Week 1: sorting"
    prompt = harness.models["planner"].prompts[0]
    assert "Course syllabus / outline the student uploaded" in prompt
    assert "(syllabus.txt)" in prompt and "Week 2: Graphs and BFS" in prompt
    assert "User input: Plan my midterm prep in 4 sessions" in prompt
    assert [n["filename"] for n in client.get("/sessions/notes/all").json()] == ["Study Plan"]


def test_syllabus_upload_is_validated(client, harness):
    harness.use_replies()
    r = client.post("/plan/syllabus", data={"session_id": "s", "input": "plan"},
                    files={"file": ("s.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 400
