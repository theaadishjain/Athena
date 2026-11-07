"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import DashboardLayout from "@/components/ui/DashboardLayout";
import AgentBadge from "@/components/ui/AgentBadge";
import CornerTicks from "@/components/ui/CornerTicks";
import Skeleton from "@/components/ui/Skeleton";
import type { ChatSessionMeta, LoadingState } from "@/lib/types";
import { renderWithLatex } from "@/lib/renderMarkdown";
import { useAuth } from "@clerk/nextjs";
import {
  listSessions,
  getSessionMessages,
  getStudyPlan,
  planFromSyllabus,
  getAllNotes,
  type PastSummary,
} from "@/lib/api";
import { useSession } from "@/lib/session";

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function StudyPlanPage() {
  const { getToken } = useAuth();
  const session = useSession();

  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [examTopic, setExamTopic] = useState("");
  // Optional syllabus / course outline (PDF, TXT or MD) to plan from.
  const [syllabus, setSyllabus] = useState<File | null>(null);
  const [syllabusError, setSyllabusError] = useState<string | null>(null);
  const syllabusRef = useRef<HTMLInputElement>(null);
  const [sessionCount, setSessionCount] = useState(3);

  const [studyPlan, setStudyPlan] = useState<string | null>(null);
  const [planState, setPlanState] = useState<LoadingState>("idle");
  const [planError, setPlanError] = useState<string | null>(null);
  const [memoryUpdated, setMemoryUpdated] = useState(false);

  const [pastPlans, setPastPlans] = useState<PastSummary[]>([]);
  // Starts true so the list shows placeholders before the first fetch.
  const [plansLoading, setPlansLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Load sessions
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        if (cancelled) return;
        if (!token) { setSessionsLoaded(true); return; }
        const data = await listSessions(token);
        if (!cancelled) { setSessions(data); setSessionsLoaded(true); }
      } catch { if (!cancelled) setSessionsLoaded(true); }
    }
    load();
    return () => { cancelled = true; };
  }, [getToken]);

  // Load past plans — with cleanup guard
  const fetchPastPlans = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      const tok = await getToken();
      if (!tok || signal?.cancelled) return;
      setPlansLoading(true);
      const all = await getAllNotes(tok);
      if (!signal?.cancelled) {
        setPastPlans(all.filter(n => n.filename === "Study Plan"));
      }
    } catch { /* silent */ }
    finally { if (!signal?.cancelled) setPlansLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    fetchPastPlans(signal);
    return () => { signal.cancelled = true; };
  }, [fetchPastPlans]);

  // Generate plan
  const handleGenerate = useCallback(async () => {
    if (!examTopic.trim() && !selectedSessionId && !syllabus) return;
    if (planState === "loading") return;

    setPlanState("loading");
    setPlanError(null);
    setStudyPlan(null);
    setMemoryUpdated(false);

    try {
      const token = await getToken();
      if (!token) throw new Error("Auth failed");

      const selectedSession = sessions.find(s => s.id === selectedSessionId);
      const selectedSessionTitle = selectedSession?.title ?? "";

      let sessionContext = "";
      if (selectedSessionId) {
        try {
          const msgs = await getSessionMessages(selectedSessionId, token);
          sessionContext = msgs.filter(m => m.role === "user").slice(-5).map(m => m.content).join("; ");
        } catch { /* empty context */ }
      }

      const topicLine = examTopic.trim()
        ? `Create a detailed study schedule and exam preparation plan for: ${examTopic.trim()}.`
        : syllabus
          ? `Create a detailed study schedule and exam preparation plan for the course in my syllabus.`
          : `Create a detailed study schedule based on my recent sessions.`;

      const planInput = [
        topicLine,
        selectedSessionTitle ? `Base this on my previous study session about: "${selectedSessionTitle}".` : "",
        sessionContext ? `Key topics I have already covered: ${sessionContext}.` : "",
        `Number of study sessions needed: ${sessionCount}.`,
        "Include: daily topics, time allocation per session, revision strategy, and a final review day.",
        "Format as a structured schedule with clear day-by-day breakdown.",
      ].filter(Boolean).join(" ");

      const planSession = selectedSessionId ?? session.session_id;
      const res = syllabus
        ? await planFromSyllabus(syllabus, planInput, planSession, token)
        : await getStudyPlan({ session_id: planSession, input: planInput }, token);

      setStudyPlan(res.response);
      setMemoryUpdated(res.memory_updated);
      setPlanState("success");

      // /plan already saves the plan to notes; saving it here too made every
      // plan appear twice in Past Plans.
      fetchPastPlans().catch(() => { /* non-critical */ });

    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Failed to generate plan");
      setPlanState("error");
    }
  }, [examTopic, syllabus, selectedSessionId, sessionCount, sessions, planState, getToken, session.session_id, fetchPastPlans]);

  const canGenerate = planState !== "loading" && (!!examTopic.trim() || !!selectedSessionId || !!syllabus);

  const pickSyllabus = (selected: File | undefined) => {
    if (!selected) return;
    const ext = selected.name.slice(selected.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".txt", ".md"].includes(ext)) {
      setSyllabusError("Only .pdf, .txt and .md files are accepted.");
      return;
    }
    setSyllabusError(null);
    setSyllabus(selected);
  };

  return (
    <DashboardLayout>
      <div className="page-scroll">
        <div className="page-pad page-narrow">

          {/* Running header */}
          <div className="running-head">
            <span className="label">§ Study plan</span>
            <span className="label">Athena · MMXXVI</span>
          </div>

          {/* Page title */}
          <div className="mb-7">
            <h1 className="h-md mb-2">
              Study plan <em className="serif-i">generator.</em>
            </h1>
            <p className="text-body">Generate a structured study schedule from your sessions and topics.</p>
          </div>

          {/* Input card */}
          <div className="panel panel-tinted mb-8">
            <CornerTicks />

            <div className="panel-head px-5">
              <span className="label">§ Plan inputs</span>
              <AgentBadge agent="planner" />
            </div>

            <div className="px-6 py-5">

              {/* Exam / Topic */}
              <div className="mb-5">
                <label htmlFor="studyplan-topic-input" className="label mb-2 block">Exam / topic</label>
                <input
                  id="studyplan-topic-input"
                  value={examTopic}
                  onChange={(e) => setExamTopic(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canGenerate) handleGenerate(); }}
                  placeholder="e.g. Linear Algebra Midterm"
                  className="input-line text-[20px]"
                />
              </div>

              {/* Syllabus (optional) */}
              <div className="mb-5">
                <div className="label mb-2">Syllabus <span className="opacity-60 normal-case tracking-normal">— optional</span></div>
                <input
                  ref={syllabusRef}
                  id="studyplan-syllabus-input"
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="hidden"
                  onChange={(e) => { pickSyllabus(e.target.files?.[0]); e.target.value = ""; }}
                />
                {syllabus ? (
                  <div className="flex items-center gap-3 border border-line px-3 py-2.5">
                    <span className="flex-1 truncate text-[14px] text-cream">{syllabus.name}</span>
                    <span className="text-meta">{(syllabus.size / 1024).toFixed(1)} KB</span>
                    <button onClick={() => setSyllabus(null)} className="btn btn-tertiary btn-sm">Remove</button>
                  </div>
                ) : (
                  <button
                    onClick={() => syllabusRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); pickSyllabus(e.dataTransfer.files[0]); }}
                    className="dropzone w-full px-4 py-4 text-[14px] text-cream-dim"
                    style={{ borderWidth: 1 }}
                  >
                    Upload your syllabus or course outline (PDF, TXT, MD) — the plan follows its topics and dates
                  </button>
                )}
                {syllabusError && <div className="alert-error mt-2">{syllabusError}</div>}
              </div>

              {/* Base on session */}
              {!sessionsLoaded ? (
                <div className="mb-5">
                  <div className="label mb-2">Base on session <span className="opacity-60 normal-case tracking-normal">— optional</span></div>
                  <div className="flex flex-col gap-1">
                    {[0, 1, 2].map((i) => <Skeleton key={i} height={38} />)}
                  </div>
                </div>
              ) : sessions.length > 0 && (
                <div className="mb-5">
                  <div className="label mb-2">Base on session <span className="opacity-60 normal-case tracking-normal">— optional</span></div>
                  <div className="flex max-h-[168px] flex-col gap-1 overflow-y-auto">
                    {sessions.slice(0, 8).map((s) => (
                      <button
                        key={s.id}
                        id={`studyplan-session-${s.id}`}
                        onClick={() => setSelectedSessionId(selectedSessionId === s.id ? null : s.id)}
                        className={`choice flex items-center justify-between gap-2 ${selectedSessionId === s.id ? "is-active" : ""}`}
                      >
                        <span className="truncate">{s.title}</span>
                        <span className="shrink-0 text-[11.5px] text-dim">{relativeTime(s.created_at)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sessions count */}
              <div className="mb-5">
                <div className="label mb-2">Number of study sessions</div>
                <div className="flex gap-1">
                  {[2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSessionCount(n)}
                      className={`seg px-5 ${sessionCount === n ? "is-active" : ""}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {planError && <div className="alert-error mb-4">{planError}</div>}

              {/* Generate button */}
              <button
                id="studyplan-generate-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="btn btn-primary btn-block py-[13px]"
              >
                {planState === "loading" ? (
                  <>
                    <span className="spin-inline">◌</span>
                    Generating…
                  </>
                ) : (
                  <>
                    Generate plan →
                    <span className="font-mono text-[11px] opacity-50">/plan</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Loading state */}
          {planState === "loading" && (
            <div className="loading-box mb-8">
              <div className="spinner" />
              <p className="text-meta">Building your study schedule…</p>
            </div>
          )}

          {/* Generated plan output */}
          {planState === "success" && studyPlan && (
            <div className="panel panel-tinted mb-8">
              <CornerTicks />
              <div className="panel-head justify-between px-5">
                <div className="flex items-center gap-2.5">
                  <span className="label">§ Generated plan</span>
                  <AgentBadge agent="planner" />
                </div>
                {memoryUpdated && <span className="text-meta">✓ Saved to memory</span>}
              </div>
              <div className="px-5 py-6 sm:px-7">
                <div className="prose-chat" dangerouslySetInnerHTML={{ __html: renderWithLatex(studyPlan) }} />
              </div>
            </div>
          )}

          {/* Past plans */}
          <div className="mb-8">
            <div className="running-head mb-4 pb-2.5">
              <span className="label">§ Past plans</span>
            </div>

            {plansLoading && pastPlans.length === 0 && (
              <div role="status" aria-label="Loading past plans" className="flex flex-col gap-1.5">
                {[0, 1, 2].map((i) => <Skeleton key={i} height={46} />)}
              </div>
            )}

            {!plansLoading && pastPlans.length === 0 && (
              <p className="text-note">No study plans saved yet. Generate your first plan above.</p>
            )}

            {pastPlans.map((plan) => {
              const open = expandedId === plan.id;
              return (
                <div key={plan.id} className="mb-1.5 border border-line transition-colors hover:border-line-strong">
                  <button
                    onClick={() => setExpandedId(open ? null : plan.id)}
                    aria-expanded={open}
                    className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-4 py-3 text-left"
                  >
                    <span className="text-[14.5px] text-cream">Study Plan</span>
                    <span className="flex items-center gap-2.5 text-meta text-dim">
                      {relativeTime(plan.created_at)}
                      <span className="text-[10px]">{open ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-line px-4 pt-4 pb-4">
                      <div className="prose-chat prose-sm" dangerouslySetInnerHTML={{ __html: renderWithLatex(plan.summary) }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
