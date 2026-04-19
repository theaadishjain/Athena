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
      setCurrentIndex((prev) => prev + 1);
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
      <div className="surface-card flex flex-col items-center justify-center p-8 mt-4 animate-fade-in max-w-sm shrink-0">
        <div className="text-4xl mb-4">🎉</div>
        <h3 className="text-lg font-bold text-foreground">Done!</h3>
        <button
          onClick={() => {
            setCurrentIndex(0);
            setIsFlipped(false);
          }}
          className="mt-6 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-all hover:bg-primary/20"
        >
          Review Again
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col items-center max-w-sm">
      {/* 3D Container */}
      <div className="relative w-full h-48 [perspective:1000px] cursor-pointer group" onClick={() => setIsFlipped(!isFlipped)}>
        <div
          className="relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d]"
          style={{ transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >
          {/* Front */}
          <div className="absolute inset-0 [backface-visibility:hidden]">
            <div className="h-full w-full rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 flex flex-col items-center justify-center text-center shadow-sm transition-colors group-hover:border-[var(--color-border-light)]">
              <span className="absolute top-4 left-4 text-[10px] font-bold text-muted/50 uppercase tracking-widest">Question</span>
              <p className="text-[15px] font-medium text-foreground leading-relaxed px-4">
                {currentCard.question}
              </p>
            </div>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 [backface-visibility:hidden]"
            style={{ transform: "rotateY(180deg)" }}
          >
            <div className="h-full w-full rounded-2xl bg-[var(--color-surface)] border border-primary p-6 flex flex-col items-center justify-center text-center shadow-md">
              <span className="absolute top-4 left-4 text-[10px] font-bold text-primary/60 uppercase tracking-widest">Answer</span>
              <p className="text-[15px] text-foreground leading-relaxed px-4">
                {currentCard.answer}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full flex items-center justify-between mt-4 px-2">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="p-2 text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>

        <span className="text-[12px] font-medium text-muted/70">
          Card {currentIndex + 1} of {flashcards.length}
        </span>

        <button
          onClick={handleNext}
          className="p-2 text-primary hover:text-primary-light transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
