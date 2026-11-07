"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import DashboardLayout from "@/components/ui/DashboardLayout";
import AgentBadge from "@/components/ui/AgentBadge";
import CornerTicks from "@/components/ui/CornerTicks";
import FlashcardDeck from "@/components/chat/FlashcardDeck";
import type { Flashcard, LoadingState, ReviewGrade } from "@/lib/types";
import { useAuth } from "@clerk/nextjs";
import { sendChatMessageStream, flashcardsFromFile, gradeCard, getDueCards, type DueCards } from "@/lib/api";
import { getOrCreateSessionId } from "@/lib/session";
import { plural } from "@/lib/format";

const ACCEPTED_TYPES = ["application/pdf", "text/plain", "text/markdown"];
const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".md"];

function isAcceptedFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext);
}

type InputMode = "file" | "topic";

export default function FlashcardsPage() {
  const { getToken } = useAuth();

  // Mode
  const [mode, setMode] = useState<InputMode>("file");

  // File mode state
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Topic mode state
  const [topic, setTopic] = useState("");

  // Shared state
  const [cardCount, setCardCount] = useState(10);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const [memoryUpdated, setMemoryUpdated] = useState(false);
  // Name of the deck being studied (file name or topic), for the review schedule.
  const [deckName, setDeckName] = useState("");

  // Spaced repetition: cards due today, and the review session in progress.
  const [due, setDue] = useState<DueCards | null>(null);
  const [reviewCards, setReviewCards] = useState<Flashcard[] | null>(null);
  const [reviewRound, setReviewRound] = useState(0);
  const autoStartRef = useRef(false);

  const loadDue = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await getDueCards(token);
      setDue(data);
      // /flashcards?review=1 (from the dashboard) jumps straight into review.
      if (!autoStartRef.current && typeof window !== "undefined"
          && new URLSearchParams(window.location.search).get("review") && data.cards.length) {
        autoStartRef.current = true;
        setReviewCards(data.cards);
        setReviewRound((r) => r + 1);
      }
    } catch { /* the review panel just stays hidden */ }
  }, [getToken]);

  useEffect(() => { loadDue(); }, [loadDue]);

  const startReview = () => {
    if (!due?.cards.length) return;
    setReviewCards(due.cards);
    setReviewRound((r) => r + 1);
  };

  const finishReview = () => {
    setReviewCards(null);
    loadDue();
  };

  const gradeAndSave = useCallback(async (card: Flashcard, grade: ReviewGrade, deck: string) => {
    const token = await getToken();
    return token ? gradeCard(card, grade, deck, token) : false;
  }, [getToken]);

  // ── File handlers ─────────────────────────────────────
  const handleFile = useCallback((selected: File) => {
    if (!isAcceptedFile(selected)) {
      setError("Only .pdf, .txt, and .md files are accepted.");
      return;
    }
    setFile(selected);
    setError(null);
    setFlashcards(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  // ── Generate ──────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (mode === "file" && !file) return;
    if (mode === "topic" && !topic.trim()) return;
    if (loadingState === "loading") return;

    setLoadingState("loading");
    setError(null);
    setFlashcards(null);
    setMemoryUpdated(false);
    setDeckName(mode === "file" && file ? file.name : topic.trim());

    try {
      const token = await getToken();
      if (!token) throw new Error("Auth failed");

      const sessionId = getOrCreateSessionId();

      if (mode === "file" && file) {
        // The backend reads the whole file (PDFs included) and spreads the
        // cards across it, each citing the page it came from.
        const res = await flashcardsFromFile(file, cardCount, sessionId, token);
        if (res.status === "success" && res.flashcards && res.flashcards.length > 0) {
          setFlashcards(res.flashcards);
          setMemoryUpdated(res.memory_updated);
          setLoadingState("success");
        } else {
          setError(res.response || "No flashcards were returned. Try another file.");
          setLoadingState("error");
        }
        return;
      }

      const chatInput = `Generate ${cardCount} flashcards on the topic: ${topic.trim()}`;
      await sendChatMessageStream(
        // One-off generation: don't create a chat session or use chat history.
        { session_id: sessionId, input: chatInput, persist: false },
        token,
        () => {}, // onToken — ignore streamed text, flashcards come in onDone
        (meta) => {
          if (meta.flashcards && meta.flashcards.length > 0) {
            setFlashcards(meta.flashcards);
            setMemoryUpdated(meta.memory_updated);
            setLoadingState("success");
          } else {
            setError("No flashcards were returned. Try a more specific topic.");
            setLoadingState("error");
          }
        },
        (errMsg) => {
          setError(errMsg);
          setLoadingState("error");
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate flashcards");
      setLoadingState("error");
    }
  }, [mode, file, topic, cardCount, loadingState, getToken]);

  const handleReset = useCallback(() => {
    setFile(null);
    setTopic("");
    setFlashcards(null);
    setError(null);
    setLoadingState("idle");
    setMemoryUpdated(false);
  }, []);

  const canGenerate =
    loadingState !== "loading" &&
    (mode === "file" ? !!file : !!topic.trim());

  return (
    <DashboardLayout>
      <div className="page-scroll">
        <div className="page-pad page-narrow">

          {/* Running header */}
          <div className="running-head">
            <span className="label">§ Flashcards</span>
            <span className="label">Athena · MMXXVI</span>
          </div>

          {/* Page title */}
          <div className="mb-7">
            <h1 className="h-md mb-2">
              Flashcard <em className="serif-i">generator.</em>
            </h1>
            <p className="text-body">Generate flashcards from your notes or any topic.</p>
          </div>

          {/* Due for review (spaced repetition) */}
          {due && due.total > 0 && (
            <div className="panel mb-6">
              <div className="panel-head justify-between px-5">
                <span className="label">§ Due for review</span>
                <span className="text-meta">{plural(due.total, "card")} on your schedule</span>
              </div>
              {reviewCards ? (
                <div className="flex flex-col items-center gap-3 px-6 py-5">
                  <FlashcardDeck
                    key={reviewRound}
                    flashcards={reviewCards}
                    onGrade={(card, grade) => gradeAndSave(card, grade, card.deck ?? "Flashcards")}
                    requeueMissed
                  />
                  <button onClick={finishReview} className="btn btn-tertiary btn-sm">Done reviewing</button>
                </div>
              ) : (
                <div className="flex items-center gap-4 px-5 py-4">
                  <span className="serif-i text-[30px] leading-none">{due.due_count}</span>
                  <span className="text-note flex-1">
                    {due.due_count > 0
                      ? `card${due.due_count === 1 ? "" : "s"} due now. Cards you missed come back first.`
                      : "Nothing due right now. Cards come back on their SM-2 schedule."}
                  </span>
                  {due.due_count > 0 && (
                    <button onClick={startReview} className="btn btn-primary btn-sm">Review now →</button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Main card */}
          <div className="panel panel-tinted mb-8">
            <CornerTicks />

            {/* Card header + agent badge */}
            <div className="panel-head px-5">
              <span className="label">§ Input</span>
              <AgentBadge agent="flashcard" />
            </div>

            <div className="px-6 py-5">

              {/* Mode tab switcher */}
              <div className="mb-5 flex gap-1">
                {(["file", "topic"] as InputMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(null); }}
                    className={`seg ${mode === m ? "is-active" : ""}`}
                  >
                    {m === "file" ? "Upload file" : "Enter topic"}
                  </button>
                ))}
              </div>

              {/* Mode 1 — Upload File */}
              {mode === "file" && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => inputRef.current?.click()}
                  className={`dropzone mb-5 px-6 py-8 ${isDragOver ? "is-over" : file ? "is-ready" : ""}`}
                  style={{ borderWidth: 1 }}
                >
                  <input
                    ref={inputRef}
                    id="flashcards-file-input"
                    type="file"
                    accept=".pdf,.txt,.md"
                    className="hidden"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected) handleFile(selected);
                    }}
                  />
                  <div className="mb-2.5 text-[28px] select-none">{file ? "✅" : "📄"}</div>
                  {file ? (
                    <>
                      <p className="mb-0.5 text-[14.5px] font-semibold text-cream">{file.name}</p>
                      <p className="text-meta text-dim">{(file.size / 1024).toFixed(1)} KB — Ready to generate</p>
                    </>
                  ) : (
                    <>
                      <p className="mb-0.5 text-[14.5px] text-cream-dim">
                        <span className="font-semibold text-cream">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-meta text-dim">PDF, TXT, or Markdown — up to 10MB</p>
                    </>
                  )}
                </div>
              )}

              {/* Mode 2 — Enter Topic */}
              {mode === "topic" && (
                <div className="mb-5">
                  <label htmlFor="flashcards-topic-input" className="label mb-2 block">Topic</label>
                  <input
                    id="flashcards-topic-input"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && canGenerate) handleGenerate(); }}
                    placeholder="e.g. Photosynthesis, Binary Trees, World War II causes..."
                    className="input-line"
                  />
                </div>
              )}

              {/* Count selector */}
              <div className="mb-5">
                <div className="label mb-2">Number of flashcards</div>
                <div className="flex gap-1">
                  {[10, 20, 30].map((n) => (
                    <button
                      key={n}
                      id={`flashcard-count-${n}`}
                      onClick={() => setCardCount(n)}
                      className={`seg px-5 ${cardCount === n ? "is-active" : ""}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && <div className="alert-error mb-4">{error}</div>}

              {/* Generate button */}
              <button
                id="flashcards-generate-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="btn btn-primary btn-block py-[13px]"
              >
                {loadingState === "loading" ? (
                  <>
                    <span className="spin-inline">◌</span>
                    Generating…
                  </>
                ) : (
                  <>
                    Generate flashcards →
                    <span className="font-mono text-[11px] opacity-50">/flashcard</span>
                  </>
                )}
              </button>

            </div>
          </div>

          {/* Output area */}
          {loadingState === "loading" && (
            <div className="loading-box">
              <div className="spinner" />
              <p className="text-meta">Generating {cardCount} flashcards…</p>
            </div>
          )}

          {flashcards && flashcards.length > 0 && loadingState === "success" && (
            <div className="panel panel-tinted">
              <CornerTicks />
              <div className="panel-head justify-between px-5">
                <div className="flex items-center gap-2.5">
                  <span className="label">§ Generated — {plural(flashcards.length, "card")}</span>
                  <AgentBadge agent="flashcard" />
                </div>
                <div className="flex items-center gap-3">
                  {memoryUpdated && <span className="text-meta">✓ Saved to memory</span>}
                  <button onClick={handleReset} className="btn btn-tertiary btn-sm">Clear</button>
                </div>
              </div>
              <div className="flex min-h-[500px] flex-col items-center justify-center p-6">
                <FlashcardDeck
                  key={deckName + flashcards.length}
                  flashcards={flashcards}
                  onGrade={async (card, grade) => {
                    const ok = await gradeAndSave(card, grade, deckName);
                    loadDue();
                    return ok;
                  }}
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
