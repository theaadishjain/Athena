"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/types";

interface QuizDeckProps {
  quiz: QuizQuestion[];
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const BORDER = "1px solid rgba(237,232,220,0.15)";
const BG = "rgba(237,232,220,0.04)";
const RIGHT = "rgba(120,200,140,0.9)";
const WRONG = "rgba(230,120,110,0.9)";

const monoLabel: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(237,232,220,0.4)",
};

const primaryButton: React.CSSProperties = {
  padding: "8px 20px",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  background: "var(--cream)",
  color: "#0a0a0c",
  border: "none",
  cursor: "pointer",
};

/** Strip a leading "A." / "B)" so the letter isn't shown twice. */
function optionText(option: string): string {
  return option.replace(/^\s*\(?[A-Fa-f][).:]\s*/, "");
}

export default function QuizDeck({ quiz }: QuizDeckProps) {
  const [index, setIndex] = useState(0);
  // answers[i] = letter picked for question i
  const [answers, setAnswers] = useState<(string | null)[]>(() => quiz.map(() => null));

  if (!quiz || quiz.length === 0) return null;

  const score = answers.filter((a, i) => a !== null && a === quiz[i].correct).length;
  const isDone = index >= quiz.length;

  const restart = () => {
    setAnswers(quiz.map(() => null));
    setIndex(0);
  };

  if (isDone) {
    const pct = Math.round((score / quiz.length) * 100);
    return (
      <div style={{
        border: BORDER, background: BG, padding: "32px 24px", width: "100%", maxWidth: 680,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10, boxSizing: "border-box",
      }}>
        <div style={monoLabel}>Quiz complete</div>
        <div style={{ fontSize: 40, fontFamily: "var(--font-head)", color: "var(--cream)", lineHeight: 1 }}>
          {score} / {quiz.length}
        </div>
        <p style={{ fontSize: 14, color: "var(--cream-dim)", fontFamily: "var(--font-head)", fontStyle: "italic", margin: 0 }}>
          {pct === 100 ? "Perfect score." : pct >= 60 ? "Solid work. Review the ones you missed." : "Worth another pass on this topic."}
        </p>
        <button onClick={restart} style={{ ...primaryButton, marginTop: 8 }}>Retake quiz</button>
      </div>
    );
  }

  const q = quiz[index];
  const picked = answers[index];
  const answered = picked !== null;

  const choose = (letter: string) => {
    if (answered) return;
    setAnswers((prev) => prev.map((a, i) => (i === index ? letter : a)));
  };

  return (
    <div style={{ width: "100%", maxWidth: 680, border: BORDER, background: BG, padding: "20px 24px", boxSizing: "border-box" }}>
      <div style={{ ...monoLabel, display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span>Question · {index + 1} / {quiz.length}</span>
        <span>Score · {score}</span>
      </div>

      <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--cream)", fontFamily: "var(--font-head)", margin: "0 0 16px" }}>
        {q.question}
      </p>

      <div role="radiogroup" aria-label={`Question ${index + 1} options`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((option, i) => {
          const letter = LETTERS[i];
          const isCorrect = letter === q.correct;
          const isPicked = letter === picked;
          let border = BORDER;
          let color = "var(--cream-dim)";
          if (answered && isCorrect) { border = `1px solid ${RIGHT}`; color = "var(--cream)"; }
          else if (answered && isPicked) { border = `1px solid ${WRONG}`; }

          return (
            <button
              key={letter}
              role="radio"
              aria-checked={isPicked}
              disabled={answered}
              onClick={() => choose(letter)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left",
                padding: "10px 14px", background: isPicked ? "rgba(237,232,220,0.06)" : "transparent",
                border, color, cursor: answered ? "default" : "pointer",
                fontSize: 14, lineHeight: 1.5, fontFamily: "var(--font-head)", transition: "border-color .15s",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, paddingTop: 2, color: "rgba(237,232,220,0.5)" }}>{letter}</span>
              <span style={{ flex: 1 }}>{optionText(option)}</span>
              {answered && isCorrect && <span aria-label="correct answer" style={{ color: RIGHT }}>✓</span>}
              {answered && isPicked && !isCorrect && <span aria-label="your answer, incorrect" style={{ color: WRONG }}>✗</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ ...monoLabel, color: picked === q.correct ? RIGHT : WRONG, marginBottom: 6 }}>
            {picked === q.correct ? "Correct" : `Incorrect · answer ${q.correct}`}
          </div>
          {q.explanation && (
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--cream-dim)", fontFamily: "var(--font-head)", margin: 0 }}>
              {q.explanation}
            </p>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label="Previous question"
          style={{
            background: "transparent", border: "none", color: "var(--cream)", fontSize: 16, padding: "6px 10px",
            cursor: index === 0 ? "not-allowed" : "pointer", opacity: index === 0 ? 0.25 : 1,
          }}
        >
          ←
        </button>
        <button
          onClick={() => setIndex((i) => i + 1)}
          disabled={!answered}
          style={{ ...primaryButton, opacity: answered ? 1 : 0.35, cursor: answered ? "pointer" : "not-allowed" }}
        >
          {index === quiz.length - 1 ? "See score" : "Next"}
        </button>
      </div>
    </div>
  );
}
