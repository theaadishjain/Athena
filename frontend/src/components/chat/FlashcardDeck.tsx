"use client";

import { useState } from "react";
import type { Flashcard, ReviewGrade } from "@/lib/types";

interface FlashcardDeckProps {
  flashcards: Flashcard[];
  /**
   * Called when the student marks a card. Grading puts the card on their
   * spaced-repetition schedule (SM-2). Resolve false if it couldn't be saved.
   */
  onGrade?: (card: Flashcard, grade: ReviewGrade) => Promise<boolean> | void;
  /** Review sessions: a missed card goes to the back of the deck to try again. */
  requeueMissed?: boolean;
}

export default function FlashcardDeck({ flashcards, onGrade, requeueMissed = false }: FlashcardDeckProps) {
  const [queue, setQueue] = useState<Flashcard[]>(flashcards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [tally, setTally] = useState({ got: 0, missed: 0 });
  const [saveFailed, setSaveFailed] = useState(false);

  if (!queue || queue.length === 0) return null;

  const isDone = currentIndex >= queue.length;
  const currentCard = queue[currentIndex];

  const goTo = (index: number) => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex(index), 150);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    goTo(Math.min(currentIndex + 1, queue.length));
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex > 0) goTo(currentIndex - 1);
  };

  const handleGrade = (grade: ReviewGrade) => {
    const card = currentCard;
    setTally((t) => (grade === "got_it" ? { ...t, got: t.got + 1 } : { ...t, missed: t.missed + 1 }));
    if (grade === "missed" && requeueMissed) setQueue((q) => [...q, card]);
    Promise.resolve(onGrade?.(card, grade)).then((ok) => { if (ok === false) setSaveFailed(true); });
    goTo(currentIndex + 1);
  };

  const restart = () => {
    setQueue(flashcards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setTally({ got: 0, missed: 0 });
  };

  if (isDone) {
    const graded = tally.got + tally.missed;
    return (
      <div className="study-card flex max-w-[480px] flex-col items-center gap-3 px-6 py-10 text-center">
        <div className="text-[32px]">🎉</div>
        <p className="serif-i text-[18px]">All {flashcards.length} cards reviewed.</p>
        {graded > 0 && (
          <p className="text-meta m-0">
            Got it: {tally.got} · Missed: {tally.missed}
            {onGrade && !saveFailed && " — saved to your review schedule; missed cards come back soonest."}
            {saveFailed && " — some grades couldn't be saved."}
          </p>
        )}
        <button onClick={restart} className="btn btn-primary btn-sm mt-2">Review again</button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[680px]">

      {/* Flip container */}
      <div className="flip" onClick={() => setIsFlipped((f) => !f)}>
        <div className={`flip-inner ${isFlipped ? "is-flipped" : ""}`}>

          {/* FRONT — Question */}
          <div className="flip-face">
            <div className="label mb-3 flex justify-between">
              <span>Question · {currentIndex + 1} / {queue.length}</span>
              {currentCard.deck && <span className="truncate pl-4">{currentCard.deck}</span>}
            </div>
            <p className="m-0 text-[17px] leading-[1.6] text-cream">{currentCard.question}</p>
            <div className="text-meta mt-4 text-dim">Click to reveal answer ↗</div>
          </div>

          {/* BACK — Answer */}
          <div className="flip-face flip-back">
            <div className="label mb-3 flex justify-between">
              <span>Answer</span>
              {currentCard.source && <span>Source · {currentCard.source}</span>}
            </div>
            <p className="m-0 text-[15.5px] leading-[1.6] text-cream-dim">{currentCard.answer}</p>
          </div>

        </div>

        {/* Spacer — keeps nav below absolute-positioned faces */}
        <div className="min-h-[200px]" />
      </div>

      {/* Grade the card once the answer is showing */}
      {onGrade && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {isFlipped ? (
            <>
              <button onClick={() => handleGrade("missed")} className="btn btn-ghost btn-sm min-w-[120px]">✗ Missed it</button>
              <button onClick={() => handleGrade("got_it")} className="btn btn-primary btn-sm min-w-[120px]">✓ Got it</button>
            </>
          ) : (
            <span className="text-meta">Flip the card, then mark it Got it or Missed it</span>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <button onClick={handlePrev} disabled={currentIndex === 0} className="btn-arrow" aria-label="Previous card">
          ←
        </button>
        <span className="text-meta">{currentIndex + 1} / {queue.length}</span>
        <button onClick={handleNext} className="btn-arrow" aria-label="Next card">
          →
        </button>
      </div>
    </div>
  );
}
