"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import DashboardLayout from "@/components/ui/DashboardLayout";
import AgentBadge from "@/components/ui/AgentBadge";
import CornerTicks from "@/components/ui/CornerTicks";
import FlashcardDeck from "@/components/chat/FlashcardDeck";
import { SkeletonRows } from "@/components/ui/Skeleton";
import type { Flashcard, UnifiedResponse, LoadingState } from "@/lib/types";
import { renderWithLatex } from "@/lib/renderMarkdown";
import { useAuth } from "@clerk/nextjs";
import { summarizeFileStream, flashcardsFromFile, getAllNotes, saveNote, type PastSummary } from "@/lib/api";
import { getOrCreateSessionId } from "@/lib/session";

const ACCEPTED_TYPES = ["application/pdf", "text/plain", "text/markdown"];
const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".md"];

function isAcceptedFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext);
}

export default function NotesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<UnifiedResponse | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // The summary as it streams in, before the final checked text arrives.
  const [streamText, setStreamText] = useState("");
  // Flashcards made from the summarized file, on request.
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [cardsState, setCardsState] = useState<LoadingState>("idle");
  const [cardsError, setCardsError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { getToken } = useAuth();
  const [pastSummaries, setPastSummaries] = useState<PastSummary[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Starts true so the archive shows placeholders, not "No summaries yet",
  // before the first fetch has run.
  const [summariesLoading, setSummariesLoading] = useState(true);

  const fetchPastSummaries = useCallback(async () => {
    try {
      const tok = await getToken();
      if (!tok) return;
      setSummariesLoading(true);
      const data = await getAllNotes(tok);
      setPastSummaries(data);
    } catch {
      // silent fail
    } finally {
      setSummariesLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchPastSummaries();
  }, [fetchPastSummaries]);

  const handleExportPDF = useCallback(() => {
    if (!summary) return;
    const printArea = document.getElementById("summary-print-area");
    if (!printArea) return;
    const contentDiv = document.getElementById("summary-print-content");
    if (!contentDiv) return;
    contentDiv.innerHTML = renderWithLatex(summary.response);
    setTimeout(() => window.print(), 300);
  }, [summary]);

  const exportSummaryAsMarkdown = useCallback(() => {
    if (!summary || !file) return;
    const content = [
      `# Athena Summary`,
      `*File: ${file.name}*`,
      `*Date: ${new Date().toLocaleDateString()}*`,
      ``,
      summary.response,
    ].join("\n");
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `athena-summary-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [summary, file]);

  const handleFile = useCallback((selected: File) => {
    if (!isAcceptedFile(selected)) {
      setError("Only .pdf, .txt, and .md files are accepted.");
      return;
    }
    setFile(selected);
    setError(null);
    setSummary(null);
    setLoadingState("idle");
    setCards(null);
    setCardsState("idle");
    setCardsError(null);
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

  const handleUpload = useCallback(async () => {
    if (!file || loadingState === "loading") return;
    setLoadingState("loading");
    setError(null);
    setUploadProgress(0);
    setStreamText("");

    // Fake progress while the file is read, until the summary starts arriving.
    const progressInterval = setInterval(() => {
      setUploadProgress(p => {
        if (p === null || p >= 85) return p;
        return Math.min(85, p + 2 + Math.random() * 4);
      });
    }, 200);
    const stopProgress = () => { clearInterval(progressInterval); setUploadProgress(null); };

    try {
      const token = await getToken();
      if (!token) throw new Error("Auth failed");
      const activeSessionId = getOrCreateSessionId();
      let first = true;
      await summarizeFileStream(
        file,
        activeSessionId,
        token,
        (chunk) => {
          if (first) { first = false; stopProgress(); }
          setStreamText((t) => t + chunk);
        },
        (meta) => {
          stopProgress();
          // The final text has invented citations removed; it replaces the stream.
          setSummary({
            status: meta.fallback ? "error" : "success",
            agent: "summarizer",
            response: meta.content,
            memory_updated: meta.memory_updated,
            fallback: meta.fallback,
          });
          setStreamText("");
          setLoadingState("success");
          if (!meta.fallback) {
            saveNote(activeSessionId, file.name, meta.content, token)
              .catch(() => {})
              .finally(() => fetchPastSummaries());
          }
        },
        (message) => {
          stopProgress();
          setStreamText("");
          setError(message);
          setLoadingState("error");
        }
      );
    } catch (err) {
      stopProgress();
      setError(err instanceof Error ? err.message : "Failed to summarize file");
      setLoadingState("error");
    }
  }, [file, loadingState, getToken, fetchPastSummaries]);

  const handleReset = useCallback(() => {
    setFile(null);
    setSummary(null);
    setStreamText("");
    setError(null);
    setLoadingState("idle");
    setUploadProgress(null);
    setCards(null);
    setCardsState("idle");
    setCardsError(null);
  }, []);

  // Same whole-document generator as the Flashcards page: cards from every
  // part of the file, each citing its page.
  const handleMakeFlashcards = useCallback(async () => {
    if (!file || cardsState === "loading") return;
    setCardsState("loading");
    setCardsError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Auth failed");
      const res = await flashcardsFromFile(file, 10, getOrCreateSessionId(), token);
      if (res.status === "success" && res.flashcards?.length) {
        setCards(res.flashcards);
        setCardsState("success");
      } else {
        setCardsError(res.response || "No flashcards were returned.");
        setCardsState("error");
      }
    } catch (err) {
      setCardsError(err instanceof Error ? err.message : "Failed to make flashcards");
      setCardsState("error");
    }
  }, [file, cardsState, getToken]);

  const writing = loadingState === "loading" && streamText !== "";
  const showSummary = (loadingState === "success" && summary !== null) || writing;

  return (
    <DashboardLayout>
      <div className="page-scroll">
        <div className="page-pad">

          {/* Running header */}
          <div className="running-head mb-7">
            <span className="label">§ Notes & summaries</span>
            <span className="label">{pastSummaries.length} documents</span>
            <span className="label">Powered by Summarizer</span>
          </div>

          <div className="grid grid-cols-[1.4fr_1fr] items-start gap-7">

            {/* Left: upload + summary */}
            <div>
              <div className="mb-5 flex items-baseline justify-between">
                <h1 className="h-md text-[48px]">
                  Drop your <em className="serif-i">lecture.</em>
                </h1>
                {(file || showSummary) && (
                  <button onClick={handleReset} className="btn btn-ghost btn-sm">Clear</button>
                )}
              </div>

              {/* Upload zone */}
              {!showSummary && (
                <>
                  <div
                    id="notes-drop-zone"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => loadingState !== "loading" && inputRef.current?.click()}
                    className={`dropzone min-h-[260px] gap-4 px-10 py-[52px] ${isDragOver ? "is-over" : ""} ${loadingState === "loading" ? "is-busy" : ""}`}
                  >
                    <CornerTicks size={10} color="rgba(237,232,220,0.3)" />
                    <input
                      ref={inputRef}
                      id="notes-file-input"
                      type="file"
                      accept=".pdf,.txt,.md"
                      className="hidden"
                      onChange={(e) => {
                        const selected = e.target.files?.[0];
                        if (selected) handleFile(selected);
                      }}
                    />

                    {/* Upload icon */}
                    <div className="text-cream">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>

                    {file ? (
                      <div>
                        <div className="serif-i mb-1.5 text-[21px]">{file.name}</div>
                        <div className="text-meta">{(file.size / 1024).toFixed(1)} KB — ready to summarize</div>
                      </div>
                    ) : (
                      <div>
                        <div className="serif-i mb-1.5 text-[23px]">Drop a PDF, TXT, or paste text</div>
                        <div className="text-meta">Lecture notes · textbook chapter · research paper</div>
                      </div>
                    )}

                    <div className="flex gap-1.5">
                      {[".PDF", ".TXT", ".MD"].map(t => <span key={t} className="tag-xs">{t}</span>)}
                    </div>

                    {/* Progress bar */}
                    {uploadProgress !== null && (
                      <div className="absolute right-5 bottom-5 left-5">
                        <div className="mb-1.5 flex justify-between">
                          <span className="label label-strong">Summarizer · extracting</span>
                          <span className="label label-strong">{Math.round(uploadProgress)}%</span>
                        </div>
                        <div className="progress"><span style={{ width: `${uploadProgress}%` }} /></div>
                      </div>
                    )}
                  </div>

                  {/* Action row */}
                  <div className="mt-4 flex items-center gap-2.5">
                    <button
                      id="notes-summarize-btn"
                      onClick={handleUpload}
                      disabled={!file || loadingState === "loading"}
                      className="btn btn-primary"
                    >
                      {loadingState === "loading" ? "Summarizing…" : "Summarize →"}
                    </button>
                    {error && <span className="text-meta text-cream">{error}</span>}
                  </div>

                  <p className="text-note mt-4">
                    Summarizer reads the whole document and cites the page behind every
                    key point and definition. One click then turns it into flashcards, and
                    the summary feeds Memory.
                  </p>
                </>
              )}

              {/* Summary doc */}
              {showSummary && (
                <div className="panel">
                  <CornerTicks />

                  {/* Doc header */}
                  <div className="border-b border-line px-5 py-4">
                    <div className="mb-2.5 flex items-center gap-2.5">
                      <AgentBadge agent={summary?.agent ?? "summarizer"} />
                      {writing ? (
                        <span className="label ml-auto inline-flex items-center gap-1.5">
                          <span className="pulse-dot h-[5px] w-[5px]" /> Writing…
                        </span>
                      ) : (
                        <span className="label ml-auto">Complete</span>
                      )}
                    </div>
                    <h2 className="h-sm mb-1.5"><em className="serif-i">{file?.name}</em></h2>
                    <div className="label">{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
                  </div>

                  {/* Body */}
                  <div className="px-6 pt-5 pb-6">
                    <div className="label mb-2.5">§ Summary</div>
                    <div className="prose-chat" dangerouslySetInnerHTML={{ __html: renderWithLatex(summary?.response ?? streamText, { citations: true }) }} />

                    {summary?.memory_updated && (
                      <div className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-muted">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                        <span className="label">Saved to memory</span>
                      </div>
                    )}

                    {/* Export row */}
                    {!writing && (<>
                    <div className="mt-4 flex items-center gap-2 border-t border-line pt-3.5">
                      <span className="label">Export →</span>
                      <button id="export-pdf-btn" onClick={handleExportPDF} className="btn btn-ghost btn-sm">PDF</button>
                      <button id="export-md-btn" onClick={exportSummaryAsMarkdown} className="btn btn-ghost btn-sm">Markdown</button>
                      <span className="text-meta ml-auto">Saved just now</span>
                    </div>

                    {/* Flashcards from this file */}
                    <div className="mt-4 border-t border-line pt-4">
                      {cardsState !== "success" ? (
                        <div className="flex items-center gap-3">
                          <button
                            id="notes-flashcards-btn"
                            onClick={handleMakeFlashcards}
                            disabled={cardsState === "loading"}
                            className="btn btn-primary btn-sm"
                          >
                            {cardsState === "loading" ? <><span className="spin-inline">◌</span> Making flashcards…</> : "Make 10 flashcards from this file →"}
                          </button>
                          {cardsError && <span className="text-meta text-cream">{cardsError}</span>}
                        </div>
                      ) : cards && (
                        <>
                          <div className="label mb-3">§ Flashcards — {cards.length} cards</div>
                          <FlashcardDeck flashcards={cards} />
                        </>
                      )}
                    </div>
                    </>)}
                  </div>
                </div>
              )}
            </div>

            {/* Right: past summaries */}
            <div className="panel">
              <div className="panel-head px-4">
                <span className="label">§ Archive · {pastSummaries.length}</span>
                <span className="label ml-auto">Sorted by recent</span>
              </div>

              {summariesLoading && pastSummaries.length === 0 ? (
                <SkeletonRows rows={4} className="px-4 py-1.5" />
              ) : pastSummaries.length === 0 ? (
                <p className="text-note px-4 py-6">No summaries yet. Drop a lecture above.</p>
              ) : (
                <div className="divider-row">
                  {pastSummaries.map((n) => {
                    const open = expandedId === n.id;
                    return (
                      <div key={n.id} style={{ background: open ? "rgba(237,232,220,0.02)" : undefined }}>
                        <div
                          onClick={() => setExpandedId(open ? null : n.id)}
                          className="row-hover grid grid-cols-[1fr_20px] items-center gap-2.5 px-4 py-3"
                          style={{ borderLeft: `2px solid ${open ? "var(--cream)" : "transparent"}` }}
                        >
                          <div className="min-w-0">
                            <div className="label mb-0.5 text-[10.5px]">
                              {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                            <div className="truncate text-[14.5px] text-cream">{n.filename}</div>
                          </div>
                          <span
                            className="inline-block text-[13px] text-dim transition-transform duration-150"
                            style={{ transform: open ? "rotate(90deg)" : undefined }}
                          >›</span>
                        </div>

                        {open && (
                          <div className="px-4 pb-4">
                            <div className="mb-3 flex flex-wrap gap-1.5">
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  // Export individual past summary as markdown
                                  const content = [`# ${n.filename}`, ``, n.summary].join("\n");
                                  const blob = new Blob([content], { type: "text/markdown" });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `athena-${n.filename.replace(/\s/g, "-")}.md`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                              >
                                Export
                              </button>
                            </div>
                            <div className="prose-chat prose-sm" dangerouslySetInnerHTML={{ __html: renderWithLatex(n.summary, { citations: true }) }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hidden print area */}
        {summary && (
          <div id="summary-print-area" style={{ display: "none" }}>
            <div style={{ padding: "2rem" }}>
              <h1 style={{ fontSize: "20pt", marginBottom: "0.5rem" }}>Athena — Document Summary</h1>
              <p style={{ fontSize: "11pt", color: "#666", marginBottom: "0.25rem" }}>File: {file?.name}</p>
              <p style={{ fontSize: "11pt", color: "#666", marginBottom: "1rem" }}>Date: {new Date().toLocaleDateString()}</p>
              <hr style={{ marginBottom: "1rem" }} />
              <div id="summary-print-content" style={{ fontSize: "11pt", lineHeight: "1.6", color: "#000" }} />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
