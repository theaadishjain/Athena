import pytest

from app.agents.shared.memory_rules import (
    extract_preference,
    summary_topic,
    weak_subject_from_summary,
)


@pytest.mark.parametrize(
    "text",
    [
        "what does a linked list look like?",
        "explain this likely exam question",
        "unlike arrays, how do linked lists work?",
        "explain the method of least squares",
        "Create a detailed study schedule and exam preparation plan for: graphs. "
        "Key topics I have already covered: trees.",
        "how many hours does it take light to reach Mars?",
        "what is a coding style guide?",
    ],
)
def test_not_a_preference(text):
    assert extract_preference(text) is None


@pytest.mark.parametrize(
    "text, expected",
    [
        ("I prefer short study sessions.", "I prefer short study sessions."),
        ("Explain recursion. I learn best with diagrams!", "I learn best with diagrams!"),
        ("i usually study late at night", "i usually study late at night"),
        ("My learning style is visual, so use examples", "My learning style is visual, so use examples"),
        ("I'm a visual learner", "I'm a visual learner"),
        ("I only have 2 hours a day for this", "I only have 2 hours a day for this"),
    ],
)
def test_preference_sentence_is_extracted(text, expected):
    assert extract_preference(text) == expected


def test_preference_is_capped():
    long = "I prefer " + "very " * 200 + "long sessions"
    assert len(extract_preference(long)) == 300


def test_summary_topic_skips_generic_headings():
    summary = "## Summary\nStuff\n## Graph Traversal: BFS and DFS\nMore\n## Revision Checklist"
    assert summary_topic(summary) == "Graph Traversal: BFS and DFS"


def test_summary_topic_strips_summary_prefix_and_bold():
    assert summary_topic("# Summary of **Photosynthesis**\nText") == "Photosynthesis"
    assert summary_topic("**Cell Division**\nText") == "Cell Division"


def test_summary_topic_falls_back_to_source():
    assert summary_topic("No headings here.", "Graph Traversal Basics: Graph traversal means...") == \
        "Graph Traversal Basics: Graph traversal means..."


def test_weak_subject_only_when_flagged_difficult():
    easy = "# Photosynthesis\nPlants turn light into sugar."
    hard = "# Organic Mechanisms\nSN1 vs SN2 is commonly confused and challenging."
    assert weak_subject_from_summary(easy, "source") is None
    assert weak_subject_from_summary(hard, "source") == "Challenging topic: Organic Mechanisms"


def test_challenge_substrings_do_not_trigger():
    # "challenge" used to match; only clear difficulty wording counts now.
    assert weak_subject_from_summary("# Hackathons\nThe challenge round lasts 2 hours.", "") is None
