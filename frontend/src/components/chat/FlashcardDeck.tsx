"use client";

import { useState } from "react";
import type { Flashcard } from "@/lib/types";

interface FlashcardDeckProps {
  flashcards: Flashcard[];
}

export default function FlashcardDeck({ flashcards }: FlashcardDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (!flashcards || flashcards.length === 0) return null;

  const isDone = currentIndex === flashcards.length;
  const currentCard = flashcards[currentIndex];

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, flashcards.length));
    }, 150);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => {
        setCurrentIndex((prev) => prev - 1);
      }, 150);
    }
  };

  if (isDone) {
    return (
      <div className="study-card flex max-w-[480px] flex-col items-center gap-3 px-6 py-10">
        <div className="text-[32px]">🎉</div>
        <p className="serif-i text-[18px]">All {flashcards.length} cards reviewed.</p>
        <button onClick={() => { setCurrentIndex(0); setIsFlipped(false); }} className="btn btn-primary btn-sm mt-2">
          Review again
        </button>
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
            <div className="label mb-3">Question · {currentIndex + 1} / {flashcards.length}</div>
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

      {/* Navigation */}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <button onClick={handlePrev} disabled={currentIndex === 0} className="btn-arrow" aria-label="Previous card">
          ←
        </button>
        <span className="text-meta">{currentIndex + 1} / {flashcards.length}</span>
        <button onClick={handleNext} className="btn-arrow" aria-label="Next card">
          →
        </button>
      </div>
    </div>
  );
}
