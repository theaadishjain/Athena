"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import DashboardLayout from "@/components/ui/DashboardLayout";
import AgentBadge from "@/components/ui/AgentBadge";
import type { UnifiedResponse, LoadingState } from "@/lib/types";
import { renderWithLatex } from "@/lib/renderMarkdown";
import { useAuth } from "@clerk/nextjs";
import { summarizeFile, getAllNotes, saveNote, type PastSummary } from "@/lib/api";
import { useSession, getOrCreateSessionId } from "@/lib/session";

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

export default function NotesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<UnifiedResponse | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useSession();
  const { getToken } = useAuth();
  const [pastSummaries, setPastSummaries] = useState<PastSummary[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [summariesLoading, setSummariesLoading] = useState(false);

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

    // Animate fake progress up to 85% while waiting
    const progressInterval = setInterval(() => {
      setUploadProgress(p => {
        if (p === null || p >= 85) return p;
        return Math.min(85, p + 4 + Math.random() * 6);
      });
    }, 140);

    try {
      const token = await getToken();
      if (!token) throw new Error("Auth failed");
      const activeSessionId = getOrCreateSessionId();
      const res = await summarizeFile(file, activeSessionId, token);
      clearInterval(progressInterval);
      setUploadProgress(100);
      setTimeout(() => setUploadProgress(null), 400);
      setSummary(res);
      setLoadingState("success");
      saveNote(activeSessionId, file.name, res.response, token)
        .catch(() => {})
        .finally(() => fetchPastSummaries());
    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(null);
      setError(err instanceof Error ? err.message : "Failed to summarize file");
      setLoadingState("error");
    }
  }, [file, loadingState, getToken, fetchPastSummaries]);

  const handleReset = useCallback(() => {
    setFile(null);
    setSummary(null);
    setError(null);
    setLoadingState("idle");
    setUploadProgress(null);
  }, []);

  const showSummary = loadingState === "success" && summary !== null;

  return (
    <DashboardLayout>
      <div style={{ flex: 1, minWidth: 0, height: "100%", overflow: "auto" }}>
        <div style={{ padding: "34px 40px" }}>

          {/* Running header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 28,
          }}>
            <span className="sect-num">§ NOTES & SUMMARIES</span>
            <span className="sect-num">{pastSummaries.length} DOCUMENTS</span>
            <span className="sect-num">POWERED BY SUMMARIZER</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, alignItems: "start" }}>

            {/* Left: upload + summary */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
                <h1 style={{
                  fontSize: 48, lineHeight: 0.98,
                  fontFamily: "var(--font-head)", fontWeight: 400,
                  letterSpacing: "-0.02em", color: "var(--cream)",
                }}>
                  Drop your <em className="serif-i">lecture.</em>
                </h1>
                {(file || showSummary) && (
                  <button
                    onClick={handleReset}
                    style={{
                      fontSize: 10, padding: "6px 12px",
                      color: "var(--text-muted)", background: "transparent",
                      border: "1px solid var(--border-strong)",
                      fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
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
                    style={{
                      border: `1.5px dashed ${isDragOver ? "var(--cream)" : "var(--border-strong)"}`,
                      padding: "52px 40px",
                      textAlign: "center",
                      cursor: loadingState === "loading" ? "default" : "pointer",
                      background: isDragOver ? "rgba(237,232,220,0.04)" : "transparent",
                      transition: "all .2s",
                      position: "relative",
                      minHeight: 260,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
                    }}
                  >
                    <CornerTicks size={10} offset={0} color="rgba(237,232,220,0.3)" />
                    <input
                      ref={inputRef}
                      id="notes-file-input"
                      type="file"
                      accept=".pdf,.txt,.md"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const selected = e.target.files?.[0];
                        if (selected) handleFile(selected);
                      }}
                    />

                    {/* Upload icon */}
                    <div style={{ color: "var(--cream)" }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>

                    {file ? (
                      <div>
                        <div style={{ fontSize: 20, fontFamily: "var(--font-head)", fontStyle: "italic", color: "var(--cream)", marginBottom: 6 }}>
                          {file.name}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                          {(file.size / 1024).toFixed(1)} KB — ready to summarize
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 22, fontFamily: "var(--font-head)", fontStyle: "italic", color: "var(--cream)", marginBottom: 6 }}>
                          Drop a PDF, TXT, or paste text
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                          Lecture notes · textbook chapter · research paper
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6 }}>
                      {[".PDF", ".TXT", ".MD"].map(t => (
                        <span key={t} style={{ fontSize: 9, padding: "3px 7px", border: "1px solid var(--cream-ghost)", fontFamily: "var(--font-mono)", color: "var(--cream-dim)", letterSpacing: "0.1em" }}>{t}</span>
                      ))}
                    </div>

                    {/* Progress bar */}
                    {uploadProgress !== null && (
                      <div style={{ position: "absolute", left: 20, right: 20, bottom: 20 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span className="sect-num" style={{ color: "var(--cream)" }}>SUMMARIZER · EXTRACTING</span>
                          <span className="sect-num" style={{ color: "var(--cream)" }}>{Math.round(uploadProgress)}%</span>
                        </div>
                        <div style={{ height: 2, background: "rgba(237,232,220,0.08)" }}>
                          <div style={{ width: `${uploadProgress}%`, height: "100%", background: "var(--cream)", transition: "width .15s" }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                    <button
                      id="notes-summarize-btn"
                      onClick={handleUpload}
                      disabled={!file || loadingState === "loading"}
                      style={{
                        padding: "12px 20px",
                        background: "var(--cream)", color: "#0a0a0c",
                        fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase",
                        border: "none", cursor: !file || loadingState === "loading" ? "not-allowed" : "pointer",
                        opacity: !file || loadingState === "loading" ? 0.4 : 1,
                        transition: "opacity .15s",
                      }}
                    >
                      {loadingState === "loading" ? "Summarizing…" : "Summarize →"}
                    </button>

                    {error && (
                      <span style={{ fontSize: 11, color: "var(--cream)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                        {error}
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
                    Summarizer extracts key points, definitions, equations, and citations —
                    then generates flashcards and feeds Memory.
                  </div>
                </>
              )}

              {/* Summary doc */}
              {showSummary && (
                <div style={{ border: "1px solid var(--border-strong)", position: "relative" }}>
                  <CornerTicks size={8} offset={0} color="rgba(237,232,220,0.4)" />

                  {/* Doc header */}
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <AgentBadge agent={summary.agent} />
                      <span className="sect-num" style={{ marginLeft: "auto", fontSize: 9 }}>COMPLETE</span>
                    </div>
                    <h2 style={{ fontSize: 26, fontFamily: "var(--font-head)", color: "var(--cream)", letterSpacing: "-0.015em", marginBottom: 6 }}>
                      <em className="serif-i">{file?.name}</em>
                    </h2>
                    <div className="sect-num">{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}</div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: "20px 24px 24px" }}>
                    <div className="sect-num" style={{ marginBottom: 10 }}>§ SUMMARY</div>
                    <div
                      className="prose-chat"
                      dangerouslySetInnerHTML={{ __html: renderWithLatex(summary.response) }}
                    />

                    {summary.memory_updated && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                          SAVED TO MEMORY
                        </span>
                      </div>
                    )}

                    {/* Export row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                      <span className="sect-num">EXPORT →</span>
                      <button
                        id="export-pdf-btn"
                        onClick={handleExportPDF}
                        className="btn btn-ghost"
                        style={{ fontSize: 10, padding: "7px 12px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        PDF
                      </button>
                      <button
                        id="export-md-btn"
                        onClick={exportSummaryAsMarkdown}
                        className="btn btn-ghost"
                        style={{ fontSize: 10, padding: "7px 12px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        Markdown
                      </button>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
                        Saved just now
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: past summaries */}
            <div style={{ border: "1px solid var(--border-strong)" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                <span className="sect-num">§ ARCHIVE · {pastSummaries.length}</span>
                <span className="sect-num" style={{ marginLeft: "auto" }}>SORTED BY RECENT</span>
              </div>

              {summariesLoading ? (
                <div style={{ padding: "20px 16px" }}>
                  <p style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>Loading archive…</p>
                </div>
              ) : pastSummaries.length === 0 ? (
                <div style={{ padding: "24px 16px" }}>
                  <p style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
                    No summaries yet. Drop a lecture above.
                  </p>
                </div>
              ) : (
                pastSummaries.map((n, i) => (
                  <div key={n.id} style={{
                    borderBottom: i < pastSummaries.length - 1 ? "1px solid var(--border)" : "none",
                    background: expandedId === n.id ? "rgba(237,232,220,0.02)" : "transparent",
                  }}>
                    <div
                      onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                      style={{
                        padding: "12px 16px",
                        display: "grid", gridTemplateColumns: "1fr 50px 20px",
                        gap: 10, alignItems: "center",
                        cursor: "pointer", transition: "all .15s",
                        borderLeft: expandedId === n.id ? "1.5px solid var(--cream)" : "1.5px solid transparent",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(237,232,220,0.02)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <div className="sect-num" style={{ fontSize: 9, marginBottom: 3 }}>
                          {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--cream)", fontFamily: "var(--font-head)", letterSpacing: "0.005em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {n.filename}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                        {/* relative time placeholder */}
                      </div>
                      <span style={{
                        color: "var(--text-dim)", fontSize: 10,
                        transition: "transform .15s", display: "inline-block",
                        transform: expandedId === n.id ? "rotate(90deg)" : "rotate(0deg)",
                      }}>›</span>
                    </div>

                    {expandedId === n.id && (
                      <div style={{ padding: "0 16px 16px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 9, padding: "4px 9px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase" }}
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
                        <div
                          className="prose-chat"
                          style={{ fontSize: 13 }}
                          dangerouslySetInnerHTML={{ __html: renderWithLatex(n.summary) }}
                        />
                      </div>
                    )}
                  </div>
                ))
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
