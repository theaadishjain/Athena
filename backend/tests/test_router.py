import pytest

from app.agents.coordinator.router import detect_intent


@pytest.mark.parametrize(
    "text, expected",
    [
        # README examples
        ("I have a data structures exam in 3 days", "planner"),
        ("explain binary trees", "advisor"),
        ("create 20 flashcards on binary trees", "flashcard"),
        ("summarize this lecture PDF", "summarizer"),
        ("quiz me on photosynthesis", "quiz"),
        # previously misrouted
        ("explain this exam question about recursion", "advisor"),
        ("test me on organic chemistry", "quiz"),
        ("what happened in the first week of the French revolution?", "advisor"),
        ("tell me about planets", "advisor"),
        # planning
        ("make me a study schedule for finals", "planner"),
        ("how should I plan my revision?", "planner"),
        ("midterm next week, help", "planner"),
        ("my assignment is due tomorrow", "planner"),
        # slash commands from the chat UI
        ("/plan linear algebra", "planner"),
        ("/quiz thermodynamics", "quiz"),
        ("/flashcards cell biology", "flashcard"),
        ("/explain eigenvectors", "advisor"),
        ("/summarize the notes above", "summarizer"),
        # misc
        ("Generate 10 flashcards on the topic: summary statistics", "flashcard"),
        ("give me practice questions on graphs", "quiz"),
        ("hello", "advisor"),
        ("   ", "coordinator"),
    ],
)
def test_detect_intent(text, expected):
    assert detect_intent(text) == expected


def test_pasted_notes_do_not_change_route():
    notes = "lorem ipsum " * 40 + "this week there is a quiz and a summary"
    assert detect_intent(f"Generate 10 flashcards from these notes: {notes}") == "flashcard"
