"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/ui/DashboardLayout";
import ToolCard from "@/components/ui/ToolCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ErrorBanner from "@/components/ui/ErrorBanner";
import type { MemoryEntry, LoadingState } from "@/lib/types";
import { getStudyPlan, getMemories } from "@/lib/api";
import { useSession } from "@/lib/session";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const router = useRouter();
  const [chatInput, setChatInput] = useState("");
  const [studyPlan, setStudyPlan] = useState<string | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [planState, setPlanState] = useState<LoadingState>("idle");
  const [memoryState, setMemoryState] = useState<LoadingState>("idle");
  const [planError, setPlanError] = useState<string | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const session = useSession();

  const fetchPlan = useCallback(async () => {
    setPlanState("loading");
    setPlanError(null);
    try {
      const res = await getStudyPlan({
        user_id: session.user_id,
        session_id: session.session_id,
        input: "Generate my study plan",
      });
      setStudyPlan(res.response);
      setPlanState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load study plan";
      setPlanError(message);
      setPlanState("error");
    }
  }, [session]);

  const fetchMemories = useCallback(async () => {
    setMemoryState("loading");
    setMemoryError(null);
    try {
      const res = await getMemories({
        user_id: session.user_id,
        memory_type: "past_chats",
        k: 5,
      });
      setMemories(res);
      setMemoryState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load memories";
      setMemoryError(message);
      setMemoryState("error");
    }
  }, [session]);

  useEffect(() => {
    setTimeout(() => {
      fetchPlan();
      fetchMemories();
    }, 0);
  }, [fetchPlan, fetchMemories]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(chatInput.trim())}`);
  };

  return (
    <DashboardLayout>
      <div className="p-8 lg:p-10 max-w-4xl">
        {/* Greeting */}
        <div className="mb-10 animate-fade-in">
          <h1 className="text-xl font-semibold tracking-tight mb-1">
            {getGreeting()} 👋
          </h1>
          <p className="text-[13px] text-muted">
            Here&apos;s your workspace. Pick up where you left off.
          </p>
        </div>

        {/* Chat Input */}
        <div className="mb-12 animate-fade-in" style={{ animationDelay: "60ms" }}>
          <form onSubmit={handleChatSubmit} className="surface-card p-1.5 flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/8 flex items-center justify-center shrink-0 ml-1">
              <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <input
              id="dashboard-chat-input"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Athena anything..."
              className="flex-1 bg-transparent px-2 py-2 text-[13px] text-foreground placeholder:text-muted/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="shrink-0 rounded-md bg-primary/10 text-primary px-3.5 py-1.5 text-[12px] font-medium transition-all hover:bg-primary/20 disabled:opacity-20 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </div>

        {/* Tools Grid */}
        <div className="space-y-8 animate-fade-in" style={{ animationDelay: "120ms" }}>
          {/* Study */}
          <section>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-px flex-1 max-w-[40px] bg-border-light" />
              <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em]">
                Study
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ToolCard
                title="Study Plan"
                description="AI-generated schedule from your goals."
                href="/dashboard#study-plan"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>}
              />
              <ToolCard
                title="Flashcards"
                description="Auto-generate cards from your notes."
                href="/chat?q=create flashcards from my notes"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-1.243 1.007-2.25 2.25-2.25h13.5" /></svg>}
              />
              <ToolCard
                title="Practice Quiz"
                description="Test yourself with generated questions."
                comingSoon
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" /></svg>}
              />
            </div>
          </section>

          {/* Homework */}
          <section>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-px flex-1 max-w-[40px] bg-border-light" />
              <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em]">
                Homework
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ToolCard
                title="Solve"
                description="Step-by-step solutions for problems."
                comingSoon
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25v-.008Zm2.25-4.5h.008v.008H10.5v-.008Zm0 2.25h.008v.008H10.5v-.008Zm0 2.25h.008v.008H10.5v-.008Zm2.25-4.5h.008v.008H12.75v-.008Zm0 2.25h.008v.008H12.75v-.008Zm2.25-2.25h.008v.008H15v-.008Zm0 2.25h.008v.008H15v-.008ZM4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>}
              />
              <ToolCard
                title="Write"
                description="Draft essays and assignments with AI."
                comingSoon
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>}
              />
            </div>
          </section>

          {/* Notes */}
          <section>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-px flex-1 max-w-[40px] bg-border-light" />
              <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em]">
                Notes
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ToolCard
                title="Summarize"
                description="Upload files. Get the key points."
                href="/notes"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>}
              />
              <ToolCard
                title="Recording"
                description="Lecture recording to auto-notes."
                comingSoon
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>}
              />
            </div>
          </section>
        </div>

        {/* Study Plan */}
        <section className="mt-12 animate-fade-in" style={{ animationDelay: "180ms" }} id="study-plan">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-px flex-1 max-w-[40px] bg-border-light" />
              <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em]">
                Your study plan
              </span>
            </div>
            {planState === "success" && (
              <button
                onClick={fetchPlan}
                className="text-[11px] text-muted hover:text-foreground transition-colors"
              >
                Regenerate
              </button>
            )}
          </div>

          <div className="surface-card p-5">
            {planState === "loading" && (
              <div className="flex items-center justify-center py-10">
                <LoadingSpinner size="lg" label="Generating your study plan…" />
              </div>
            )}
            {planState === "error" && planError && (
              <ErrorBanner message={planError} onRetry={fetchPlan} />
            )}
            {planState === "success" && studyPlan && (
              <p className="whitespace-pre-wrap text-[13px] leading-[1.8] text-foreground/75">
                {studyPlan}
              </p>
            )}
          </div>
        </section>

        {/* Memories */}
        <section className="mt-10 mb-10 animate-fade-in" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="h-px flex-1 max-w-[40px] bg-border-light" />
            <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em]">
              Recent context
            </span>
          </div>

          <div className="surface-card p-5">
            {memoryState === "loading" && (
              <div className="flex items-center justify-center py-10">
                <LoadingSpinner size="lg" label="Loading memories…" />
              </div>
            )}
            {memoryState === "error" && memoryError && (
              <ErrorBanner message={memoryError} onRetry={fetchMemories} />
            )}
            {memoryState === "success" && memories.length === 0 && (
              <p className="text-[13px] text-muted/60 text-center py-6">
                No context yet. Start chatting or upload notes to build memory.
              </p>
            )}
            {memoryState === "success" && memories.length > 0 && (
              <div className="space-y-2">
                {memories.map((mem, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="shrink-0 mt-0.5 inline-flex items-center rounded bg-primary/8 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary/80">
                      {mem.memory_type}
                    </span>
                    <p className="text-[13px] leading-relaxed text-foreground/65">
                      {mem.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
