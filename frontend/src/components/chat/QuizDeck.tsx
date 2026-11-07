"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/types";

export interface QuizOutcome {
  score: number;
  total: number;
  missed: { question: string; correct_answer: string }[];
}

interface QuizDeckProps {
  quiz: QuizQuestion[];
  /** Called once per finished attempt; resolve true if the score was saved. */
  onComplete?: (outcome: QuizOutcome) => Promise<boolean> | void;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Strip a leading "A." / "B)" so the letter isn't shown twice. */
function optionText(option: string): string {
  return option.replace(/^\s*\(?[A-Fa-f][).:]\s*/, "");
}

export default function QuizDeck({ quiz, onComplete }: QuizDeckProps) {
  const [index, setIndex] = useState(0);
  // answers[i] = letter picked for question i
  const [answers, setAnswers] = useState<(string | null)[]>(() => quiz.map(() => null));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  if (!quiz || quiz.length === 0) return null;

  const score = answers.filter((a, i) => a !== null && a === quiz[i].correct).length;
  const isDone = index >= quiz.length;

  const restart = () => {
    setAnswers(quiz.map(() => null));
    setIndex(0);
    setSaveState("idle");
  };

  const finish = () => {
    setIndex(quiz.length);
    if (!onComplete) return;
    const missed = quiz
      .map((q, i) => ({ q, picked: answers[i] }))
      .filter(({ q, picked }) => picked !== q.correct)
      .map(({ q }) => ({
        question: q.question,
        correct_answer: optionText(q.options[LETTERS.indexOf(q.correct)] ?? ""),
      }));
    setSaveState("saving");
    Promise.resolve(onComplete({ score, total: quiz.length, missed }))
      .then((ok) => setSaveState(ok === false ? "failed" : "saved"))
      .catch(() => setSaveState("failed"));
  };

  if (isDone) {
    const pct = Math.round((score / quiz.length) * 100);
    return (
      <div className="study-card flex flex-col items-center gap-2.5 px-6 py-8">
        <div className="label">Quiz complete</div>
        <div className="serif text-[44px] leading-none">{score} / {quiz.length}</div>
        <p className="text-body m-0">
          {pct === 100 ? "Perfect score." : pct >= 60 ? "Solid work. Review the ones you missed." : "Worth another pass on this topic."}
        </p>
        {onComplete && saveState !== "idle" && (
          <p className="text-meta m-0">
            {saveState === "saving" && "Saving your score…"}
            {saveState === "saved" && (score < quiz.length
              ? "Score saved. Missed questions were added to your weak areas, so your next quiz will target them."
              : "Score saved.")}
            {saveState === "failed" && "Couldn't save your score."}
          </p>
        )}
        <button onClick={restart} className="btn btn-primary btn-sm mt-2">Retake quiz</button>
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
    <div className="study-card">
      <div className="label mb-3 flex justify-between">
        <span>Question · {index + 1} / {quiz.length}</span>
        <span>Score · {score}</span>
      </div>

      <p className="mb-4 text-[17px] leading-[1.6] text-cream">{q.question}</p>

      <div role="radiogroup" aria-label={`Question ${index + 1} options`} className="flex flex-col gap-2">
        {q.options.map((option, i) => {
          const letter = LETTERS[i];
          const isCorrect = letter === q.correct;
          const isPicked = letter === picked;
          const state = [
            isPicked ? "is-picked" : "",
            answered && isCorrect ? "is-correct" : "",
            answered && isPicked && !isCorrect ? "is-wrong" : "",
          ].join(" ");

          return (
            <button
              key={letter}
              role="radio"
              aria-checked={isPicked}
              disabled={answered}
              onClick={() => choose(letter)}
              className={`quiz-option ${state}`}
            >
              <span className="pt-px text-[13px] font-semibold text-dim">{letter}</span>
              <span className="flex-1">{optionText(option)}</span>
              {answered && isCorrect && <span aria-label="correct answer" style={{ color: "var(--right)" }}>✓</span>}
              {answered && isPicked && !isCorrect && <span aria-label="your answer, incorrect" style={{ color: "var(--wrong)" }}>✗</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="mt-3.5 border-t border-line pt-3">
          <div className="label mb-1.5" style={{ color: picked === q.correct ? "var(--right)" : "var(--wrong)" }}>
            {picked === q.correct ? "Correct" : `Incorrect · answer ${q.correct}`}
          </div>
          {q.explanation && <p className="text-body m-0 text-[14.5px]">{q.explanation}</p>}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label="Previous question"
          className="btn-arrow"
        >
          ←
        </button>
        <button
          onClick={() => (index === quiz.length - 1 ? finish() : setIndex((i) => i + 1))}
          disabled={!answered}
          className="btn btn-primary btn-sm"
        >
          {index === quiz.length - 1 ? "See score" : "Next"}
        </button>
      </div>
    </div>
  );
}
