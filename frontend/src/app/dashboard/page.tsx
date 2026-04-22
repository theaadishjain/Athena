"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import DashboardLayout from "@/components/ui/DashboardLayout";
import ToolCard from "@/components/ui/ToolCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ErrorBanner from "@/components/ui/ErrorBanner";
import AgentBadge from "@/components/ui/AgentBadge";
import type { ChatSessionMeta, LoadingState, ChatMessage } from "@/lib/types";
import {
  listSessions,
  getSessionMessages,
  getStudyPlan,
  getMemoryProfile,
} from "@/lib/api";
import { useSession } from "@/lib/session";
import { renderWithLatex } from "@/lib/renderMarkdown";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins > 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [chatInput, setChatInput] = useState("");
  const session = useSession();
  const { getToken } = useAuth();

  // ── Sessions (shared) ──────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // ── Study Plan ─────────────────────────────────────────────
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [studyPlan, setStudyPlan] = useState<string | null>(null);
  const [planState, setPlanState] = useState<LoadingState>("idle");
  const [planError, setPlanError] = useState<string | null>(null);

  // ── Recent Context ─────────────────────────────────────────
  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [recentSession, setRecentSession] = useState<ChatSessionMeta | null>(null);
  const [summaryState, setSummaryState] = useState<LoadingState>("idle");
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // ── Memory Profile ──────────────────────────────────────
  const [memoryProfile, setMemoryProfile] = useState<{
    preferences: string[];
    weak_subjects: string[];
    recent_topics: string[];
  } | null>(null);

  // Ref to avoid double-fetching in StrictMode
  const summaryFetchedRef = useRef(false);

  // ── Fetch sessions once on mount ───────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchSessions() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const data = await listSessions(token);
        if (!cancelled) {
          setSessions(data);
          setSessionsLoaded(true);
        }
      } catch {
        if (!cancelled) setSessionsLoaded(true); // show empty state
      }
    }
    fetchSessions();
    return () => { cancelled = true; };
  }, [getToken]);

  // ── Fetch recent context after sessions load ───────────────
  useEffect(() => {
    if (!sessionsLoaded) return;
    if (summaryFetchedRef.current) return;
    if (sessions.length === 0) {
      setSummaryState("success");
      return;
    }

    summaryFetchedRef.current = true;
    const mostRecent = sessions[0];
    setRecentSession(mostRecent);

    async function fetchRecentActivity() {
      setSummaryState("loading");
      setSummaryError(null);
      try {
        const token = await getToken();
        if (!token) return;

        const msgs = await getSessionMessages(mostRecent.id, token);
        const userMsgs = msgs
          .filter((m) => m.role === "user")
          .slice(-4);
        
        setRecentMessages(userMsgs);
        setSummaryState("success");
      } catch {
        setSummaryError("Failed to load recent activity");
        setSummaryState("error");
      }
    }

    fetchRecentActivity();

    // Fetch memory profile in parallel
    getToken().then((tok) => {
      if (!tok || !summaryFetchedRef.current) return;
      getMemoryProfile(tok)
        .then(setMemoryProfile)
        .catch(() => {/* silent */});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsLoaded]);

  // ── Generate Study Plan (button click only) ────────────────
  const handleGeneratePlan = useCallback(async () => {
    if (!selectedSessionId) return;
    setPlanState("loading");
    setPlanError(null);
    setStudyPlan(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Auth failed");

      const msgs = await getSessionMessages(selectedSessionId, token);
      const combined = msgs
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const res = await getStudyPlan(
        {
          session_id: selectedSessionId,
          input: combined,
        },
        token
      );

      setStudyPlan(res.response);
      setPlanState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate plan";
      setPlanError(message);
      setPlanState("error");
    }
  }, [selectedSessionId, getToken, session.user_id]);

  // ── Dashboard chat handoff ─────────────────────────────────
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sessionStorage.setItem("athena_pending_query", chatInput.trim());
    sessionStorage.removeItem("athena_current_session");
    sessionStorage.removeItem("studyco_current_session");
    router.push("/chat");
  };

  const filteredPreferences = memoryProfile?.preferences
    .map(p => p.replace(/\*\*/g, ""))
    .filter(p => p.length >= 20)
    .filter(p => !/generate|study plan|flashcard|quiz/i.test(p)) || [];

  const filteredWeakSubjects = memoryProfile?.weak_subjects
    .map(s => s.replace(/\*\*/g, ""))
    .filter(s => s.length >= 10)
    .filter(s => !/my name|nickname|hello|hi/i.test(s)) || [];

  const filteredTopics = memoryProfile?.recent_topics
    .filter(t => t.startsWith("Topic:"))
    .map(t => t.replace("Topic:", "").replace(/\*\*/g, "").trim())
    .slice(0, 5) || [];

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
                href="/chat?q=create a practice quiz for me"
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

        {/* ── Study Plan Section ──────────────────────────────── */}
        <section className="mt-12 animate-fade-in" style={{ animationDelay: "180ms" }} id="study-plan">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="h-px flex-1 max-w-[40px] bg-border-light" />
            <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em]">
              Your study plan
            </span>
          </div>

          <div className="surface-card p-5 space-y-4">
            {/* Session list or empty state */}
            {!sessionsLoaded ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="sm" label="Loading sessions…" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-[13px] text-muted/60 text-center py-6">
                Start a chat first to generate your study plan.
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted/60 mb-2">
                  Select a chat session to base the plan on:
                </p>
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    id={`session-row-${s.id}`}
                    onClick={() => setSelectedSessionId(s.id)}
                    className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-all border ${
                      selectedSessionId === s.id
                        ? "border-primary/40 bg-primary/8 text-foreground"
                        : "border-transparent bg-white/[0.02] hover:bg-white/[0.04] text-foreground/70"
                    }`}
                  >
                    <span className="text-[13px] truncate flex-1">
                      {s.title.slice(0, 35)}{s.title.length > 35 ? "…" : ""}
                    </span>
                    <span className="text-[11px] text-muted/50 shrink-0">
                      {relativeTime(s.created_at)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Generate button */}
            {sessionsLoaded && sessions.length > 0 && (
              <button
                id="generate-plan-btn"
                onClick={handleGeneratePlan}
                disabled={!selectedSessionId || planState === "loading"}
                className="rounded-lg bg-primary px-6 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {planState === "loading" ? "Generating…" : "Generate Study Plan"}
              </button>
            )}

            {/* Plan results */}
            {planState === "loading" && (
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner size="sm" label="Building your plan…" />
              </div>
            )}
            {planState === "error" && planError && (
              <ErrorBanner message={planError} onRetry={handleGeneratePlan} />
            )}
            {planState === "success" && studyPlan && (
              <div className="pt-2 border-t border-border-light">
                <div
                  className="prose-chat prose-invert"
                  dangerouslySetInnerHTML={{
                    __html: renderWithLatex(studyPlan),
                  }}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Recent Context Section ──────────────────────────── */}
        <section className="mt-10 mb-10 animate-fade-in" style={{ animationDelay: "240ms" }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="h-px flex-1 max-w-[40px] bg-border-light" />
            <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em]">
              Recent context
            </span>
          </div>

          <div className="surface-card p-5">
            {summaryState === "loading" && (
              <div className="flex items-center justify-center py-10">
                <LoadingSpinner size="lg" label="Summarizing recent activity…" />
              </div>
            )}
            {summaryState === "error" && summaryError && (
              <ErrorBanner message={summaryError} onRetry={() => {
                summaryFetchedRef.current = false;
                setSummaryState("idle");
                setSummaryError(null);
              }} />
            )}
            {(summaryState === "idle" || summaryState === "success") && (sessions.length === 0 || recentMessages.length === 0) && sessionsLoaded && (
              <p className="text-[13px] text-muted/60 text-center py-6">
                No recent activity yet. Start a chat to see your study history here.
              </p>
            )}
            {summaryState === "success" && recentMessages.length > 0 && recentSession && (
              <div className="space-y-4">
                <p className="text-[11px] text-muted/60 uppercase tracking-wider font-medium">
                  What you studied recently:
                </p>
                <ul className="space-y-1">
                  {recentMessages.map((msg, i) => (
                    <li key={i} className="text-sm text-foreground/80 py-2 border-b border-white/[0.03] last:border-0">
                      {msg.content.slice(0, 120)}
                      {msg.content.length > 120 ? "..." : ""}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted/50 pt-2 italic">
                  From: {recentSession.title} · {relativeTime(recentSession.created_at)}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── What Athena Knows ────────────────────────────── */}
        <section className="mt-10 mb-10 animate-fade-in" style={{ animationDelay: "300ms" }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="h-px flex-1 max-w-[40px] bg-border-light" />
            <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em]">
              What Athena knows
            </span>
          </div>

          <div className="surface-card p-5 space-y-4">
            {!memoryProfile ? (
              <p className="text-[13px] text-muted/60 text-center py-6">
                Athena is still learning about you. Keep chatting to build your profile.
              </p>
            ) : filteredPreferences.length === 0 &&
              filteredWeakSubjects.length === 0 &&
              filteredTopics.length === 0 ? (
              <p className="text-[13px] text-muted/60 text-center py-6">
                Keep chatting with Athena to build your personal study profile.
              </p>
            ) : (
              <>
                {filteredPreferences.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted/50 uppercase tracking-wider mb-2">YOUR STUDY STYLE</p>
                    <div className="flex flex-wrap gap-2">
                      {filteredPreferences.map((p, i) => (
                        <span
                          key={i}
                          className="inline-block rounded-full bg-primary/10 text-primary px-3 py-1 text-[12px] font-medium"
                        >
                          {p.slice(0, 80)}{p.length > 80 ? "…" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {filteredWeakSubjects.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-medium text-muted/50 uppercase tracking-wider mb-2">AREAS TO FOCUS ON</p>
                    <ul className="space-y-1">
                      {filteredWeakSubjects.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-foreground/80">
                          <span className="shrink-0 text-yellow-500/90 text-[11px] mt-[1px]">⚠</span>
                          <span className="text-yellow-500/90">{s.slice(0, 80)}{s.length > 80 ? "…" : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {filteredTopics.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-medium text-muted/50 uppercase tracking-wider mb-2">TOPICS YOU&apos;VE EXPLORED</p>
                    <ul className="space-y-1">
                      {filteredTopics.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-foreground/80">
                          <span className="shrink-0 text-primary/80 text-[12px] mt-[1px]">📚</span>
                          {t.slice(0, 80)}{t.length > 80 ? "…" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
