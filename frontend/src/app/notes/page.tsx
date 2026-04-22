"use client";

import { useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/ui/DashboardLayout";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ErrorBanner from "@/components/ui/ErrorBanner";
import AgentBadge from "@/components/ui/AgentBadge";
import type { UnifiedResponse, LoadingState } from "@/lib/types";
import { renderWithLatex } from "@/lib/renderMarkdown";
import { useAuth } from "@clerk/nextjs";
import { summarizeFile } from "@/lib/api";
import { useSession, getOrCreateSessionId } from "@/lib/session";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useSession();
  const { getToken } = useAuth();

  // ── Export handlers ─────────────────────────────────────
  const handleExportPDF = useCallback(() => {
    if (!summary) return;

    const printArea = document.getElementById("summary-print-area");
    if (!printArea) return;

    const contentDiv = document.getElementById("summary-print-content");
    if (!contentDiv) return;

    contentDiv.innerHTML = renderWithLatex(summary.response);

    // Give browser time to render injected HTML
    setTimeout(() => {
      window.print();
    }, 300);
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
    try {
      const token = await getToken();
      if (!token) throw new Error("Auth failed");
      const activeSessionId = getOrCreateSessionId();
      const res = await summarizeFile(file, activeSessionId, token);
      setSummary(res);
      setLoadingState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to summarize file";
      setError(message);
      setLoadingState("error");
    }
  }, [file, loadingState, session, getToken]);

  const handleReset = useCallback(() => {
    setFile(null);
    setSummary(null);
    setError(null);
    setLoadingState("idle");
  }, []);

  return (
    <DashboardLayout>
      <div className="px-8 pt-10 pb-16 max-w-5xl w-full">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-xl font-semibold tracking-tight mb-1">Notes</h1>
          <p className="text-[13px] text-muted">
            Drop a file and get the key points in seconds.
          </p>
        </div>

        {/* Drop Zone */}
        <div
          className={`surface-card transition-all duration-200 cursor-pointer animate-fade-in ${
            isDragOver
              ? "border-primary/40 bg-primary/[0.03]"
              : file
                ? "border-primary/20"
                : "hover:border-border-light"
          }`}
          style={{ animationDelay: "60ms" }}
        >
          <div
            id="notes-drop-zone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center py-14 px-6 text-center"
          >
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

            <div
              className={`mb-4 text-3xl select-none transition-transform duration-200 ${
                isDragOver ? "scale-110" : ""
              }`}
            >
              {file ? "✅" : "📄"}
            </div>

            {file ? (
              <>
                <p className="text-[13px] font-medium text-primary mb-0.5">
                  {file.name}
                </p>
                <p className="text-[11px] text-muted">
                  {(file.size / 1024).toFixed(1)} KB — Ready to summarize
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-foreground/80 mb-0.5">
                  <span className="text-primary font-medium">Click to upload</span>{" "}
                  or drag and drop
                </p>
                <p className="text-[11px] text-muted/60">
                  PDF, TXT, or Markdown — up to 10MB
                </p>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center gap-3 animate-fade-in" style={{ animationDelay: "120ms" }}>
          <button
            id="notes-summarize-btn"
            onClick={handleUpload}
            disabled={!file || loadingState === "loading"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loadingState === "loading" ? (
              <LoadingSpinner size="sm" />
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            )}
            {loadingState === "loading" ? "Summarizing…" : "Summarize"}
          </button>

          {(file || summary) && (
            <button
              onClick={handleReset}
              className="text-[12px] text-muted hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}

          {summary && loadingState === "success" && (
            <>
              <button
                id="export-pdf-btn"
                onClick={handleExportPDF}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-[12px] font-medium text-muted hover:text-foreground hover:bg-white/[0.04] transition-all"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                Export PDF
              </button>
              <button
                id="export-md-btn"
                onClick={exportSummaryAsMarkdown}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-[12px] font-medium text-muted hover:text-foreground hover:bg-white/[0.04] transition-all"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export MD
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="mt-5">
            <ErrorBanner message={error} onRetry={() => setError(null)} />
          </div>
        )}

        {loadingState === "loading" && (
          <div className="mt-8 surface-card p-6 animate-fade-in">
            <div className="flex flex-col items-center py-8">
              <LoadingSpinner size="lg" label="Reading and summarizing…" />
              <div className="mt-4 w-full max-w-xs h-1 rounded-full bg-white/[0.04] overflow-hidden">
                <div className="h-full rounded-full bg-primary/40 animate-shimmer" style={{ width: "60%" }} />
              </div>
            </div>
          </div>
        )}

        {summary && loadingState === "success" && (
          <div className="mt-8 animate-fade-in">
            <div className="surface-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="text-lg select-none">📝</div>
                  <div>
                    <h2 className="text-[14px] font-semibold">Summary</h2>
                    <p className="text-[11px] text-muted">{file?.name}</p>
                  </div>
                </div>
                <AgentBadge agent={summary.agent} />
              </div>

              <div className="rounded-lg bg-white/[0.02] p-4">
                <div
                  className="prose-chat prose-invert"
                  dangerouslySetInnerHTML={{
                    __html: renderWithLatex(summary.response),
                  }}
                />
              </div>

              {summary.memory_updated && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-primary/70">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Saved to memory
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hidden print area — shown only during window.print() */}
      {summary && (
        <div id="summary-print-area" style={{ display: "none" }}>
          <div style={{ padding: "2rem" }}>
            <h1 style={{ fontSize: "20pt", marginBottom: "0.5rem" }}>
              Athena — Document Summary
            </h1>
            <p style={{ fontSize: "11pt", color: "#666", marginBottom: "0.25rem" }}>
              File: {file?.name}
            </p>
            <p style={{ fontSize: "11pt", color: "#666", marginBottom: "1rem" }}>
              Date: {new Date().toLocaleDateString()}
            </p>
            <hr style={{ marginBottom: "1rem" }} />
            <div
              id="summary-print-content"
              style={{ fontSize: "11pt", lineHeight: "1.6", color: "#000" }}
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
