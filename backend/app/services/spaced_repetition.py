"""SM-2 spaced repetition (the SuperMemo-2 algorithm).

Each card has an ease factor (starts at 2.5), an interval in days and a
count of successful reviews in a row. "Got it" grows the interval
(1 day, 6 days, then interval x ease); "Missed it" resets the card so it
comes back within minutes and lowers its ease, so cards a student keeps
missing are shown more often from then on.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

Grade = Literal["missed", "got_it"]

# SM-2 rates recall 0-5; below 3 counts as a failure.
QUALITY: dict[str, int] = {"missed": 1, "got_it": 4}

DEFAULT_EASE = 2.5
MIN_EASE = 1.3
RELEARN_AFTER = timedelta(minutes=10)


@dataclass
class Schedule:
    ease: float = DEFAULT_EASE
    interval_days: int = 0
    repetitions: int = 0
    lapses: int = 0


def review(card: Schedule, grade: Grade, now: datetime) -> tuple[Schedule, datetime]:
    """Apply one review; return the new schedule and when the card is next due."""
    q = QUALITY[grade]
    ease = max(MIN_EASE, card.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))

    if q < 3:
        updated = Schedule(ease=ease, interval_days=0, repetitions=0, lapses=card.lapses + 1)
        return updated, now + RELEARN_AFTER

    repetitions = card.repetitions + 1
    if repetitions == 1:
        interval = 1
    elif repetitions == 2:
        interval = 6
    else:
        interval = max(1, round(card.interval_days * card.ease))
    updated = Schedule(ease=ease, interval_days=interval, repetitions=repetitions, lapses=card.lapses)
    return updated, now + timedelta(days=interval)
