"use client";

import { useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/ui/DashboardLayout";
import AgentBadge from "@/components/ui/AgentBadge";
import FlashcardDeck from "@/components/chat/FlashcardDeck";
import type { Flashcard, LoadingState } from "@/lib/types";
import { useAuth } from "@clerk/nextjs";
import { sendChatMessageStream } from "@/lib/api";
import { getOrCreateSessionId } from "@/lib/session";

const ACCEPTED_TYPES = ["application/pdf", "text/plain", "text/markdown"];
const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".md"];

function isAcceptedFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext);
}

function CornerTicks({ size = 8, offset = 0, color = "rgba(237,232,220,0.3)" }: { size?: number; offset?: number; color?: string }) {
  const corners: React.CSSProperties[] = [
    { top: offset, left: offset },
    { top: offset, right: offset },
    { bottom: offset, right: offset },
    { bottom: offset, left: offset },
  ];
  const rotations = ["rotate(0)", "rotate(90deg)", "rotate(180deg)", "rotate(270deg)"];
  return (
    <>
      {corners.map((style, i) => (
        <svg key={i} style={{ position: "absolute", ...style, transform: rotations[i] }} width={size} height={size} viewBox="0 0 8 8" fill="none">
          <path d="M0 8 L0 0 L8 0" stroke={color} strokeWidth="1" />
        </svg>
      ))}
    </>
  );
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

  // ── Read file text ─────────────────────────────────────
  const readFileText = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (ext === ".pdf") {
        // Can't read PDF client-side — use filename as topic
        resolve(`[PDF file: ${f.name}]`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string ?? "");
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(f);
    });
  };

  // ── Generate ──────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (mode === "file" && !file) return;
    if (mode === "topic" && !topic.trim()) return;
    if (loadingState === "loading") return;

    setLoadingState("loading");
    setError(null);
    setFlashcards(null);
    setMemoryUpdated(false);

    try {
      const token = await getToken();
      if (!token) throw new Error("Auth failed");

      const sessionId = getOrCreateSessionId();

      let chatInput: string;
      if (mode === "file" && file) {
        const fileText = await readFileText(file);
        chatInput = `Generate ${cardCount} flashcards from these notes: ${fileText.slice(0, 3000)}`;
      } else {
        chatInput = `Generate ${cardCount} flashcards on the topic: ${topic.trim()}`;
      }

      await sendChatMessageStream(
        { session_id: sessionId, input: chatInput },
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
      <div style={{ flex: 1, minWidth: 0, height: "100%", overflow: "auto" }}>
        <div style={{ padding: "34px 40px", maxWidth: 860 }}>

          {/* Running header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 32,
          }}>
            <span className="sect-num">§ FLASHCARDS</span>
            <span className="sect-num">ATHENA · MMXXVI</span>
          </div>

          {/* Page title */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontFamily: "var(--font-head)", fontWeight: 400, fontSize: 42,
              lineHeight: 1.05, color: "var(--cream)", letterSpacing: "-0.02em",
              marginBottom: 8,
            }}>
              Flashcard <em className="serif-i">generator.</em>
            </h1>
            <p style={{ fontSize: 14, color: "var(--cream-dim)", fontWeight: 300 }}>
              Generate flashcards from your notes or any topic.
            </p>
          </div>

          {/* Main card */}
          <div style={{
            border: "1px solid var(--border-strong)",
            background: "rgba(237,232,220,0.015)",
            position: "relative",
            marginBottom: 32,
          }}>
            <CornerTicks size={8} offset={0} color="rgba(237,232,220,0.4)" />

            {/* Card header + agent badge */}
            <div style={{
              padding: "12px 20px", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span className="sect-num">§ INPUT</span>
              <AgentBadge agent="flashcard" />
            </div>

            <div style={{ padding: "20px 24px" }}>

              {/* Mode tab switcher */}
              <div style={{ display: "flex", gap: 3, marginBottom: 20 }}>
                {(["file", "topic"] as InputMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(null); }}
                    style={{
                      padding: "7px 16px",
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      background: mode === m ? "var(--cream)" : "transparent",
                      color: mode === m ? "#0a0a0c" : "var(--text-muted)",
                      border: `1px solid ${mode === m ? "var(--cream)" : "var(--border-strong)"}`,
                      cursor: "pointer",
                      transition: "all .15s",
                    }}
                  >
                    {m === "file" ? "Upload File" : "Enter Topic"}
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
                  style={{
                    border: `1px dashed ${isDragOver ? "var(--cream)" : file ? "rgba(237,232,220,0.4)" : "var(--border-strong)"}`,
                    background: isDragOver ? "rgba(237,232,220,0.04)" : "transparent",
                    padding: "32px 24px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all .2s",
                    marginBottom: 20,
                    textAlign: "center",
                  }}
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
                  <div style={{ fontSize: 28, marginBottom: 10, userSelect: "none" }}>
                    {file ? "✅" : "📄"}
                  </div>
                  {file ? (
                    <>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--cream)", marginBottom: 2 }}>
                        {file.name}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-dim)" }}>
                        {(file.size / 1024).toFixed(1)} KB — Ready to generate
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: "var(--cream-dim)", marginBottom: 2 }}>
                        <span style={{ color: "var(--cream)", fontWeight: 500 }}>Click to upload</span>{" "}
                        or drag and drop
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-dim)" }}>
                        PDF, TXT, or Markdown — up to 10MB
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Mode 2 — Enter Topic */}
              {mode === "topic" && (
                <div style={{ marginBottom: 20 }}>
                  <label className="sect-num" style={{ fontSize: 9, display: "block", marginBottom: 8 }}>
                    TOPIC
                  </label>
                  <input
                    id="flashcards-topic-input"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && canGenerate) handleGenerate(); }}
                    placeholder="e.g. Photosynthesis, Binary Trees, World War II causes..."
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border-strong)",
                      color: "var(--cream)",
                      fontFamily: "var(--font-head)",
                      fontSize: 18,
                      padding: "8px 0",
                      outline: "none",
                    }}
                  />
                </div>
              )}

              {/* Count selector */}
              <div style={{ marginBottom: 20 }}>
                <label className="sect-num" style={{ fontSize: 9, display: "block", marginBottom: 8 }}>
                  NUMBER OF FLASHCARDS
                </label>
                <div style={{ display: "flex", gap: 3 }}>
                  {[10, 20, 30].map((n) => (
                    <button
                      key={n}
                      id={`flashcard-count-${n}`}
                      onClick={() => setCardCount(n)}
                      style={{
                        padding: "6px 20px",
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: cardCount === n ? "#0a0a0c" : "var(--text-muted)",
                        background: cardCount === n ? "var(--cream)" : "transparent",
                        border: `1px solid ${cardCount === n ? "var(--cream)" : "var(--border-strong)"}`,
                        cursor: "pointer",
                        transition: "all .12s",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  marginBottom: 16,
                  padding: "10px 14px",
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.05)",
                  fontSize: 12,
                  color: "rgba(239,68,68,0.9)",
                  fontFamily: "var(--font-mono)",
                }}>
                  {error}
                </div>
              )}

              {/* Generate button */}
              <button
                id="flashcards-generate-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  width: "100%",
                  padding: "13px",
                  background: canGenerate ? "var(--cream)" : "rgba(237,232,220,0.15)",
                  color: canGenerate ? "#0a0a0c" : "var(--text-dim)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  border: "none",
                  cursor: canGenerate ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all .15s",
                }}
              >
                {loadingState === "loading" ? (
                  <>
                    <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>◌</span>
                    Generating…
                  </>
                ) : (
                  <>
                    Generate flashcards →
                    <span style={{ fontSize: 9, opacity: 0.5 }}>/flashcard</span>
                  </>
                )}
              </button>

            </div>
          </div>

          {/* Output area */}
          {loadingState === "loading" && (
            <div style={{
              border: "1px solid var(--border)",
              padding: "48px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              background: "rgba(237,232,220,0.01)",
            }}>
              <div style={{
                width: 32, height: 32, border: "1px solid rgba(237,232,220,0.3)",
                borderTopColor: "var(--cream)", borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }} />
              <p style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                Generating {cardCount} flashcards…
              </p>
            </div>
          )}

          {flashcards && flashcards.length > 0 && loadingState === "success" && (
            <div style={{ border: "1px solid var(--border-strong)", position: "relative", background: "rgba(237,232,220,0.015)" }}>
              <CornerTicks size={8} offset={0} color="rgba(237,232,220,0.4)" />
              <div style={{
                padding: "12px 20px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="sect-num">§ GENERATED — {flashcards.length} CARDS</span>
                  <AgentBadge agent="flashcard" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {memoryUpdated && (
                    <span style={{ fontSize: 10, color: "rgba(237,232,220,0.5)", fontFamily: "var(--font-mono)" }}>
                      ✓ Saved to memory
                    </span>
                  )}
                  <button
                    onClick={handleReset}
                    style={{
                      fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)",
                      background: "transparent", border: "none", cursor: "pointer",
                      letterSpacing: "0.08em", textTransform: "uppercase",
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 500,
              }}>
                <FlashcardDeck flashcards={flashcards} />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </DashboardLayout>
  );
}
