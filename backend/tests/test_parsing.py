import pytest

from app.agents.advisor.nodes import strip_mode_label
from app.agents.shared.parsing import clean_flashcards, clean_quiz, parse_json_array


def test_parse_plain_array():
    assert parse_json_array('[{"a": 1}]') == [{"a": 1}]


def test_parse_fenced_array():
    assert parse_json_array('```json\n[{"a": 1}]\n```') == [{"a": 1}]


def test_parse_array_with_preamble():
    assert parse_json_array('Sure! Here they are:\n[{"a": 1}]\nGood luck.') == [{"a": 1}]


def test_parse_rejects_non_array():
    with pytest.raises(ValueError):
        parse_json_array('{"a": 1}')
    with pytest.raises(ValueError):
        parse_json_array("no json here")


def test_clean_flashcards_drops_bad_items():
    items = [{"question": "Q", "answer": "A"}, {"question": "", "answer": "x"}, "junk"]
    assert clean_flashcards(items) == [{"question": "Q", "answer": "A"}]


def test_clean_quiz_normalizes_correct_answer():
    items = [
        {"question": "Q1", "options": ["A. x", "B. y", "C. z", "D. w"], "correct": "B. y", "explanation": "e"},
        {"question": "Q2", "options": ["A. x", "B. y"], "correct": "a"},
        {"question": "Q3", "options": ["A. red", "B. blue"], "correct": "blue"},
        {"question": "Q4", "options": ["A. x", "B. y"], "correct": "D"},  # out of range
        {"question": "Q5", "options": ["only one"], "correct": "A"},  # too few options
    ]
    cleaned = clean_quiz(items)
    assert [q["correct"] for q in cleaned] == ["B", "A", "B"]
    assert cleaned[1]["explanation"] == ""


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("BRIEF mode: Eigenvectors are...", "Eigenvectors are..."),
        ("**DETAILED mode:** Eigenvectors are...", "Eigenvectors are..."),
        ("Eigenvectors are...", "Eigenvectors are..."),
    ],
)
def test_strip_mode_label(raw, expected):
    assert strip_mode_label(raw) == expected
