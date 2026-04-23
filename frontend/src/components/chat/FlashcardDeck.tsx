"use client";

import { useState } from "react";
import type { Flashcard } from "@/lib/types";

interface FlashcardDeckProps {
  flashcards: Flashcard[];
}

const CARD_BORDER = "1px solid rgba(237,232,220,0.15)";
const CARD_BG = "rgba(237,232,220,0.04)";
const CARD_BG_ANSWER = "rgba(237,232,220,0.07)";

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
      <div style={{
        border: CARD_BORDER,
        background: CARD_BG,
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        width: "100%",
        maxWidth: 480,
      }}>
        <div style={{ fontSize: 32 }}>🎉</div>
        <p style={{ fontSize: 14, color: "var(--cream)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
          All {flashcards.length} cards reviewed.
        </p>
        <button
          onClick={() => { setCurrentIndex(0); setIsFlipped(false); }}
          style={{
            marginTop: 8,
            padding: "8px 20px",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            background: "var(--cream)",
            color: "#0a0a0c",
            border: "none",
            cursor: "pointer",
          }}
        >
          Review again
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 680, margin: "0 auto" }}>

      {/* Flip container */}
      <div
        onClick={() => setIsFlipped((f) => !f)}
        style={{ perspective: "1000px", width: "100%", cursor: "pointer" }}
      >
        {/* Inner rotating div */}
        <div style={{
          position: "relative",
          transformStyle: "preserve-3d",
          transition: "transform 0.4s ease",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          minHeight: 200,
        }}>

          {/* FRONT — Question */}
          <div style={{
            position: "absolute",
            width: "100%",
            minHeight: 200,
            maxHeight: 400,
            overflowY: "auto",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            background: CARD_BG,
            border: CARD_BORDER,
            padding: "20px 24px",
            boxSizing: "border-box",
          }}>
            <div style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(237,232,220,0.4)",
              marginBottom: 12,
            }}>
              Question · {currentIndex + 1} / {flashcards.length}
            </div>
            <p style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: "var(--cream)",
              fontFamily: "var(--font-head)",
              margin: 0,
            }}>
              {currentCard.question}
            </p>
            <div style={{
              marginTop: 16,
              fontSize: 10,
              color: "rgba(237,232,220,0.25)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.08em",
            }}>
              Click to reveal answer ↗
            </div>
          </div>

          {/* BACK — Answer */}
          <div style={{
            position: "absolute",
            width: "100%",
            minHeight: 200,
            maxHeight: 400,
            overflowY: "auto",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: CARD_BG_ANSWER,
            border: "1px solid rgba(237,232,220,0.25)",
            padding: "20px 24px",
            boxSizing: "border-box",
          }}>
            <div style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(237,232,220,0.5)",
              marginBottom: 12,
            }}>
              Answer
            </div>
            <p style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--cream-dim)",
              fontFamily: "var(--font-head)",
              margin: 0,
            }}>
              {currentCard.answer}
            </p>
          </div>

        </div>

        {/* Spacer — keeps nav below absolute-positioned faces */}
        <div style={{ minHeight: 200 }} />
      </div>

      {/* Navigation */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
      }}>
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          style={{
            background: "transparent",
            border: "none",
            cursor: currentIndex === 0 ? "not-allowed" : "pointer",
            opacity: currentIndex === 0 ? 0.25 : 1,
            color: "var(--cream)",
            padding: "6px 10px",
            fontSize: 16,
            lineHeight: 1,
            transition: "opacity .15s",
          }}
          aria-label="Previous card"
        >
          ←
        </button>

        <span style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-dim)",
          letterSpacing: "0.06em",
        }}>
          {currentIndex + 1} / {flashcards.length}
        </span>

        <button
          onClick={handleNext}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--cream)",
            padding: "6px 10px",
            fontSize: 16,
            lineHeight: 1,
            transition: "opacity .15s",
          }}
          aria-label="Next card"
        >
          →
        </button>
      </div>
    </div>
  );
}
