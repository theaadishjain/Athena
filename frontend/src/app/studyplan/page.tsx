"use client";

import { useState, useCallback, useEffect } from "react";
import DashboardLayout from "@/components/ui/DashboardLayout";
import AgentBadge from "@/components/ui/AgentBadge";
import type { ChatSessionMeta, LoadingState } from "@/lib/types";
import { renderWithLatex } from "@/lib/renderMarkdown";
import { useAuth } from "@clerk/nextjs";
import {
  listSessions,
  getSessionMessages,
  getStudyPlan,
  getAllNotes,
  saveNote,
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

export default function StudyPlanPage() {
  const { getToken } = useAuth();
  const session = useSession();

  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [examTopic, setExamTopic] = useState("");
  const [sessionCount, setSessionCount] = useState(3);

  const [studyPlan, setStudyPlan] = useState<string | null>(null);
  const [planState, setPlanState] = useState<LoadingState>("idle");
  const [planError, setPlanError] = useState<string | null>(null);
  const [memoryUpdated, setMemoryUpdated] = useState(false);

  const [pastPlans, setPastPlans] = useState<PastSummary[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Load sessions
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
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
    if (!examTopic.trim() && !selectedSessionId) return;
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
        : `Create a detailed study schedule based on my recent sessions.`;

      const planInput = [
        topicLine,
        selectedSessionTitle ? `Base this on my previous study session about: "${selectedSessionTitle}".` : "",
        sessionContext ? `Key topics I have already covered: ${sessionContext}.` : "",
        `Number of study sessions needed: ${sessionCount}.`,
        "Include: daily topics, time allocation per session, revision strategy, and a final review day.",
        "Format as a structured schedule with clear day-by-day breakdown.",
      ].filter(Boolean).join(" ");

      const res = await getStudyPlan(
        { session_id: selectedSessionId ?? session.session_id, input: planInput },
        token
      );

      setStudyPlan(res.response);
      setMemoryUpdated(res.memory_updated);
      setPlanState("success");

      // Save to notes
      try {
        await saveNote(selectedSessionId ?? session.session_id, "Study Plan", res.response, token);
        await fetchPastPlans();
      } catch { /* non-critical */ }

    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Failed to generate plan");
      setPlanState("error");
    }
  }, [examTopic, selectedSessionId, sessionCount, sessions, planState, getToken, session.session_id, fetchPastPlans]);

  const canGenerate = planState !== "loading" && (!!examTopic.trim() || !!selectedSessionId);

  return (
    <DashboardLayout>
      <div style={{ flex: 1, minWidth: 0, height: "100%", overflow: "auto" }}>
        <div style={{ padding: "34px 40px", maxWidth: 860 }}>

          {/* Running header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 32,
          }}>
            <span className="sect-num">§ STUDY PLAN</span>
            <span className="sect-num">ATHENA · MMXXVI</span>
          </div>

          {/* Page title */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontFamily: "var(--font-head)", fontWeight: 400, fontSize: 42,
              lineHeight: 1.05, color: "var(--cream)", letterSpacing: "-0.02em",
              marginBottom: 8,
            }}>
              Study plan <em className="serif-i">generator.</em>
            </h1>
            <p style={{ fontSize: 14, color: "var(--cream-dim)", fontWeight: 300 }}>
              Generate a structured study schedule from your sessions and topics.
            </p>
          </div>

          {/* Input card */}
          <div style={{
            border: "1px solid var(--border-strong)",
            background: "rgba(237,232,220,0.015)",
            position: "relative",
            marginBottom: 32,
          }}>
            <CornerTicks size={8} offset={0} color="rgba(237,232,220,0.4)" />

            <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <span className="sect-num">§ PLAN INPUTS</span>
              <AgentBadge agent="planner" />
            </div>

            <div style={{ padding: "20px 24px" }}>

              {/* Exam / Topic */}
              <div style={{ marginBottom: 20 }}>
                <label className="sect-num" style={{ fontSize: 9, display: "block", marginBottom: 8 }}>
                  EXAM / TOPIC
                </label>
                <input
                  id="studyplan-topic-input"
                  value={examTopic}
                  onChange={(e) => setExamTopic(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canGenerate) handleGenerate(); }}
                  placeholder="e.g. Linear Algebra Midterm"
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border-strong)",
                    color: "var(--cream)",
                    fontFamily: "var(--font-head)",
                    fontSize: 20,
                    padding: "8px 0",
                    outline: "none",
                  }}
                />
              </div>

              {/* Base on session */}
              {sessionsLoaded && sessions.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <label className="sect-num" style={{ fontSize: 9, display: "block", marginBottom: 8 }}>
                    BASE ON SESSION <span style={{ opacity: 0.4 }}>— optional</span>
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                    {sessions.slice(0, 8).map((s) => (
                      <button
                        key={s.id}
                        id={`studyplan-session-${s.id}`}
                        onClick={() => setSelectedSessionId(selectedSessionId === s.id ? null : s.id)}
                        style={{
                          textAlign: "left", padding: "8px 12px", fontSize: 12,
                          background: selectedSessionId === s.id ? "rgba(237,232,220,0.08)" : "transparent",
                          border: `1px solid ${selectedSessionId === s.id ? "var(--cream)" : "var(--border)"}`,
                          color: selectedSessionId === s.id ? "var(--cream)" : "var(--text-muted)",
                          fontFamily: "var(--font-head)", cursor: "pointer", transition: "all .12s",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.title.slice(0, 50)}{s.title.length > 50 ? "…" : ""}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--text-dim)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                          {relativeTime(s.created_at)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sessions count */}
              <div style={{ marginBottom: 20 }}>
                <label className="sect-num" style={{ fontSize: 9, display: "block", marginBottom: 8 }}>
                  NUMBER OF STUDY SESSIONS
                </label>
                <div style={{ display: "flex", gap: 3 }}>
                  {[2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSessionCount(n)}
                      style={{
                        padding: "6px 20px", fontSize: 11, fontFamily: "var(--font-mono)",
                        color: sessionCount === n ? "#0a0a0c" : "var(--text-muted)",
                        background: sessionCount === n ? "var(--cream)" : "transparent",
                        border: `1px solid ${sessionCount === n ? "var(--cream)" : "var(--border-strong)"}`,
                        cursor: "pointer", transition: "all .12s",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {planError && (
                <div style={{
                  marginBottom: 16, padding: "10px 14px",
                  border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)",
                  fontSize: 12, color: "rgba(239,68,68,0.9)", fontFamily: "var(--font-mono)",
                }}>
                  {planError}
                </div>
              )}

              {/* Generate button */}
              <button
                id="studyplan-generate-btn"
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  width: "100%", padding: "13px",
                  background: canGenerate ? "var(--cream)" : "rgba(237,232,220,0.15)",
                  color: canGenerate ? "#0a0a0c" : "var(--text-dim)",
                  fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em",
                  textTransform: "uppercase", border: "none",
                  cursor: canGenerate ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "all .15s",
                }}
              >
                {planState === "loading" ? (
                  <>
                    <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>◌</span>
                    Generating…
                  </>
                ) : (
                  <>
                    Generate plan →
                    <span style={{ fontSize: 9, opacity: 0.5 }}>/plan</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Loading state */}
          {planState === "loading" && (
            <div style={{
              border: "1px solid var(--border)", padding: "48px 24px", marginBottom: 32,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              background: "rgba(237,232,220,0.01)",
            }}>
              <div style={{
                width: 32, height: 32, border: "1px solid rgba(237,232,220,0.3)",
                borderTopColor: "var(--cream)", borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }} />
              <p style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                Building your study schedule…
              </p>
            </div>
          )}

          {/* Generated plan output */}
          {planState === "success" && studyPlan && (
            <div style={{
              border: "1px solid var(--border-strong)",
              position: "relative",
              background: "rgba(237,232,220,0.015)",
              marginBottom: 32,
            }}>
              <CornerTicks size={8} offset={0} color="rgba(237,232,220,0.4)" />
              <div style={{
                padding: "12px 20px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="sect-num">§ GENERATED PLAN</span>
                  <AgentBadge agent="planner" />
                </div>
                {memoryUpdated && (
                  <span style={{ fontSize: 10, color: "rgba(237,232,220,0.5)", fontFamily: "var(--font-mono)" }}>
                    ✓ Saved to memory
                  </span>
                )}
              </div>
              <div style={{ padding: "24px 28px" }}>
                <div
                  className="prose-chat"
                  dangerouslySetInnerHTML={{ __html: renderWithLatex(studyPlan) }}
                  style={{ fontSize: 14, lineHeight: 1.7 }}
                />
              </div>
            </div>
          )}

          {/* Past plans */}
          <div style={{ marginBottom: 32 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 16,
            }}>
              <span className="sect-num">§ PAST PLANS</span>
              {plansLoading && (
                <span style={{ fontSize: 9, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>Loading…</span>
              )}
            </div>

            {!plansLoading && pastPlans.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
                No study plans saved yet. Generate your first plan above.
              </p>
            )}

            {pastPlans.map((plan) => (
              <div
                key={plan.id}
                style={{
                  border: "1px solid var(--border)",
                  marginBottom: 6,
                  background: "transparent",
                  transition: "border-color .15s",
                }}
              >
                <button
                  onClick={() => setExpandedId(expandedId === plan.id ? null : plan.id)}
                  style={{
                    width: "100%", padding: "12px 16px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "transparent", border: "none", cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--cream)", fontFamily: "var(--font-head)" }}>
                    Study Plan
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      {relativeTime(plan.created_at)}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                      {expandedId === plan.id ? "▲" : "▼"}
                    </span>
                  </div>
                </button>
                {expandedId === plan.id && (
                  <div style={{
                    padding: "0 16px 16px",
                    borderTop: "1px solid var(--border)",
                    paddingTop: 16,
                  }}>
                    <div
                      className="prose-chat"
                      dangerouslySetInnerHTML={{ __html: renderWithLatex(plan.summary) }}
                      style={{ fontSize: 13, lineHeight: 1.7 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </DashboardLayout>
  );
}
