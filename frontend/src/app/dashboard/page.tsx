"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import DashboardLayout from "@/components/ui/DashboardLayout";
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
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatHeaderDate(): string {
  const d = new Date();
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const days = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const year = d.getFullYear().toString().replace(/./g, (c, i) => {
    const roman: Record<string, string> = { "2": "MM", "0": "O", "6": "VI" };
    return roman[c] ?? c;
  });
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${days[d.getDay()]}`;
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

export default function DashboardPage() {
  const router = useRouter();
  const session = useSession();
  const { getToken } = useAuth();

  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [studyPlan, setStudyPlan] = useState<string | null>(null);
  const [planState, setPlanState] = useState<LoadingState>("idle");
  const [planError, setPlanError] = useState<string | null>(null);
  const [examTopic, setExamTopic] = useState("");
  const [sessionCount, setSessionCount] = useState(3);

  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [recentSession, setRecentSession] = useState<ChatSessionMeta | null>(null);

  const [memoryProfile, setMemoryProfile] = useState<{
    preferences: string[];
    weak_subjects: string[];
    recent_topics: string[];
  } | null>(null);

  const summaryFetchedRef = useRef(false);

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
        if (!cancelled) setSessionsLoaded(true);
      }
    }
    fetchSessions();
    return () => { cancelled = true; };
  }, [getToken]);

  useEffect(() => {
    if (!sessionsLoaded) return;
    if (summaryFetchedRef.current) return;
    if (sessions.length === 0) return;

    summaryFetchedRef.current = true;
    const mostRecent = sessions[0];
    setRecentSession(mostRecent);

    async function fetchRecentActivity() {
      try {
        const token = await getToken();
        if (!token) return;
        const msgs = await getSessionMessages(mostRecent.id, token);
        setRecentMessages(msgs.filter((m) => m.role === "user").slice(-4));
      } catch { /* silent */ }
    }
    fetchRecentActivity();

    getToken().then((tok) => {
      if (!tok) return;
      getMemoryProfile(tok)
        .then(setMemoryProfile)
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsLoaded]);

  const handleGeneratePlan = useCallback(async () => {
    if (!examTopic.trim() && !selectedSessionId) return;
    setPlanState("loading");
    setPlanError(null);
    setStudyPlan(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Auth failed");

      // Get selected session title if a session is picked
      const selectedSession = sessions.find(s => s.id === selectedSessionId);
      const selectedSessionTitle = selectedSession?.title ?? "";

      // Fetch context messages if a session is selected
      let sessionContext = "";
      if (selectedSessionId) {
        try {
          const msgs = await getSessionMessages(selectedSessionId, token);
          const userMsgs = msgs.filter(m => m.role === "user").slice(-5);
          sessionContext = userMsgs.map(m => m.content).join("; ");
        } catch { /* use empty context */ }
      }

      // Build a proper planning prompt
      const topicLine = examTopic.trim()
        ? `Create a detailed study schedule and exam preparation plan for: ${examTopic.trim()}.`
        : `Create a detailed study schedule based on my recent sessions.`;

      const sessionLine = selectedSessionTitle
        ? `Base this on my previous study session about: "${selectedSessionTitle}".`
        : "";

      const contextLine = sessionContext
        ? `Key topics I have already covered: ${sessionContext}.`
        : "";

      const planInput = [
        topicLine,
        sessionLine,
        contextLine,
        `Number of study sessions needed: ${sessionCount}.`,
        "Include: daily topics, time allocation per session, revision strategy, and a final review day.",
        "Format as a structured schedule with clear day-by-day breakdown.",
      ].filter(Boolean).join(" ");

      const res = await getStudyPlan(
        { session_id: selectedSessionId ?? session.session_id, input: planInput },
        token
      );
      setStudyPlan(res.response);
      setPlanState("success");
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "Failed to generate plan");
      setPlanState("error");
    }
  }, [examTopic, selectedSessionId, sessionCount, sessions, getToken, session.session_id]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTopic.trim()) return;
    sessionStorage.setItem("athena_pending_query", examTopic.trim());
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

  const greeting = getGreeting();

  return (
    <DashboardLayout>
      <div style={{ flex: 1, minWidth: 0, height: "100%", overflow: "auto", position: "relative" }}>

        {/* Subtle orbital backdrop */}
        <div style={{ position: "absolute", top: 0, right: 0, width: 720, height: 720, pointerEvents: "none", zIndex: 0 }}>
          <div style={{
            position: "absolute", width: 900, height: 900, top: -300, right: -200,
            background: "radial-gradient(circle, rgba(237,232,220,0.04), transparent 70%)",
          }} />
          <svg width="720" height="720" viewBox="0 0 720 720" style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
            <g style={{ transformOrigin: "460px 260px", animation: "athenaSpin 180s linear infinite" }}>
              {[180, 260, 340].map((r, i) => (
                <ellipse key={i} cx="460" cy="260" rx={r} ry={r * 0.35}
                  fill="none" stroke="#ede8dc" strokeOpacity={0.06 + i * 0.01} strokeWidth="0.8" />
              ))}
            </g>
            <circle cx="460" cy="260" r="2" fill="#ede8dc" opacity="0.4" />
          </svg>
        </div>

        <div style={{ position: "relative", zIndex: 1, padding: "34px 40px" }}>

          {/* Running header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 32,
          }}>
            <span className="sect-num">§ DASHBOARD</span>
            <span className="sect-num">{formatHeaderDate()}</span>
            <span className="sect-num">ATHENA · MMXXVI</span>
          </div>

          {/* Greeting + Plan Generator */}
          <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 32, alignItems: "start", marginBottom: 32 }}>

            {/* Greeting block */}
            <div style={{ paddingTop: 4 }}>
              <div className="eyebrow" style={{ marginBottom: 16 }}>
                {sessions.length > 0 && recentSession
                  ? <><span style={{ color: "var(--cream)" }}>{recentSession.title.slice(0, 40)}</span> · last session</>
                  : "Start your first session today"
                }
              </div>
              <h1 style={{
                fontSize: 72, lineHeight: 0.95,
                fontFamily: "var(--font-head)", fontWeight: 400,
                letterSpacing: "-0.02em", color: "var(--cream)",
                marginBottom: 18,
              }}>
                {greeting},<br />
                <em className="serif-i">student.</em>
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.5, color: "var(--cream-dim)", maxWidth: 480, marginBottom: 24, fontWeight: 300 }}>
                {sessions.length > 0
                  ? `You have ${sessions.length} chat session${sessions.length > 1 ? "s" : ""} saved. Pick up where you left off or start something new.`
                  : "Ask anything. Athena will help you study smarter, summarize your notes, and build a study plan."
                }
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { sessionStorage.removeItem("athena_current_session"); router.push("/chat"); }}
                  className="btn btn-primary"
                  style={{ fontSize: 11, padding: "13px 20px", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  {sessions.length > 0 ? "Resume session →" : "Start chatting →"}
                </button>
                <button
                  onClick={() => router.push("/notes")}
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: "13px 18px", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  Upload lecture
                </button>
              </div>
            </div>

            {/* Plan Generator card */}
            <div style={{ border: "1px solid var(--border-strong)", position: "relative", background: "rgba(237,232,220,0.015)" }}>
              <CornerTicks size={8} offset={0} color="rgba(237,232,220,0.4)" />
              <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                <span className="sect-num">§ PLAN GENERATOR</span>
                <AgentBadge agent="Planner" />
              </div>
              <div style={{ padding: "18px 20px" }}>
                <label className="sect-num" style={{ fontSize: 9, display: "block", marginBottom: 6 }}>EXAM / TOPIC</label>
                <input
                  className="athena-input"
                  value={examTopic}
                  onChange={(e) => setExamTopic(e.target.value)}
                  placeholder="e.g. Linear Algebra Midterm"
                  style={{
                    fontFamily: "var(--font-head)", fontSize: 17, padding: "8px 0",
                    borderLeft: 0, borderRight: 0, borderTop: 0,
                    borderBottom: "1px solid var(--border-strong)",
                    background: "transparent", marginBottom: 16, display: "block", width: "100%",
                  }}
                />

                {/* Base on session */}
                {sessionsLoaded && sessions.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <label className="sect-num" style={{ fontSize: 9, display: "block", marginBottom: 6 }}>BASE ON SESSION</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 110, overflow: "auto" }}>
                      {sessions.slice(0, 5).map((s) => (
                        <button key={s.id}
                          id={`session-row-${s.id}`}
                          onClick={() => setSelectedSessionId(s.id)}
                          style={{
                            textAlign: "left", padding: "6px 10px", fontSize: 11,
                            background: selectedSessionId === s.id ? "rgba(237,232,220,0.08)" : "transparent",
                            border: `1px solid ${selectedSessionId === s.id ? "var(--cream)" : "var(--border)"}`,
                            color: selectedSessionId === s.id ? "var(--cream)" : "var(--text-muted)",
                            fontFamily: "var(--font-head)", cursor: "pointer", transition: "all .12s",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {s.title.slice(0, 40)}{s.title.length > 40 ? "…" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label className="sect-num" style={{ fontSize: 9, display: "block", marginBottom: 6 }}>SESSIONS</label>
                    <div style={{ display: "flex", gap: 3 }}>
                      {[2, 3, 4, 5].map(n => (
                        <button key={n}
                          onClick={() => setSessionCount(n)}
                          style={{
                            flex: 1, padding: "5px 0", fontSize: 11,
                            color: sessionCount === n ? "#0a0a0c" : "var(--text-muted)",
                            background: sessionCount === n ? "var(--cream)" : "transparent",
                            border: `1px solid ${sessionCount === n ? "var(--cream)" : "var(--border-strong)"}`,
                            fontFamily: "var(--font-mono)", cursor: "pointer", transition: "all .12s",
                          }}>{n}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    {planState === "error" && (
                      <span style={{ fontSize: 10, color: "var(--cream)", fontFamily: "var(--font-mono)" }}>
                        {planError}
                      </span>
                    )}
                  </div>
                </div>

                <form onSubmit={handleChatSubmit}>
                  <button
                    type="submit"
                    onClick={selectedSessionId || examTopic.trim() ? (e) => { e.preventDefault(); handleGeneratePlan(); } : undefined}
                    disabled={planState === "loading"}
                    style={{
                      width: "100%", padding: "12px",
                      background: "var(--cream)", color: "#0a0a0c",
                      fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase",
                      border: "none", cursor: planState === "loading" ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      opacity: planState === "loading" ? 0.6 : 1,
                    }}
                  >
                    {planState === "loading" ? "Generating…" : "Generate plan →"}
                    <span style={{ fontSize: 9, opacity: 0.5 }}>/plan</span>
                  </button>
                </form>
              </div>

              {planState === "success" && studyPlan && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px" }}>
                  <div className="sect-num" style={{ marginBottom: 10 }}>§ GENERATED PLAN</div>
                  <div
                    className="prose-chat"
                    dangerouslySetInnerHTML={{ __html: renderWithLatex(studyPlan) }}
                    style={{ fontSize: 13 }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Memory Profile */}
          <div style={{ border: "1px solid var(--border-strong)", marginBottom: 28 }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <span className="sect-num">§ MEMORY PROFILE</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
                what Athena remembers about how you learn
              </span>
              <span className="sect-num" style={{ marginLeft: "auto", fontSize: 9 }}>UPDATED THIS SESSION</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
              {/* Study style */}
              <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border)", minHeight: 140 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "var(--cream)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
                  <span className="sect-num" style={{ fontSize: 10, color: "var(--cream)" }}>STUDY STYLE</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {filteredPreferences.length > 0 ? filteredPreferences.slice(0, 4).map((p, i) => (
                    <span key={i} style={{ fontSize: 11, padding: "4px 9px", border: "1px solid var(--cream-ghost)", color: "var(--cream-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
                      {p.slice(0, 50)}{p.length > 50 ? "…" : ""}
                    </span>
                  )) : (
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>Still learning…</span>
                  )}
                </div>
              </div>
              {/* Weak areas */}
              <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border)", minHeight: 140 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "var(--cream)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span className="sect-num" style={{ fontSize: 10, color: "var(--cream)" }}>WEAK AREAS</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {filteredWeakSubjects.length > 0 ? filteredWeakSubjects.slice(0, 4).map((s, i) => (
                    <span key={i} style={{ fontSize: 11, padding: "4px 9px", border: "1px solid var(--cream)", color: "var(--cream)", fontFamily: "var(--font-head)" }}>
                      {s.slice(0, 40)}{s.length > 40 ? "…" : ""}
                    </span>
                  )) : (
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>None flagged yet</span>
                  )}
                </div>
              </div>
              {/* Recent topics */}
              <div style={{ padding: "18px 20px", borderRight: "1px solid var(--border)", minHeight: 140 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "var(--cream)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  <span className="sect-num" style={{ fontSize: 10, color: "var(--cream)" }}>RECENT TOPICS</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {filteredTopics.length > 0 ? filteredTopics.map((t, i) => (
                    <span key={i} style={{ fontSize: 11, padding: "4px 9px", border: "1px solid var(--cream-ghost)", color: "var(--cream-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
                      {t.slice(0, 40)}{t.length > 40 ? "…" : ""}
                    </span>
                  )) : (
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>No topics yet</span>
                  )}
                </div>
              </div>
              {/* Sessions */}
              <div style={{ padding: "18px 20px", minHeight: 140 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "var(--cream)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span className="sect-num" style={{ fontSize: 10, color: "var(--cream)" }}>SESSIONS</span>
                </div>
                <div>
                  <div style={{ fontSize: 32, fontFamily: "var(--font-head)", fontStyle: "italic", color: "var(--cream)", lineHeight: 1, marginBottom: 6 }}>
                    {sessions.length}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    total chats
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid var(--border)", marginBottom: 28 }}>
            {[
              { label: "Chat", sub: `${sessions.length} sessions`, agent: "Advisor", href: "/chat",
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
              { label: "Notes", sub: "summarize files", agent: "Summarizer", href: "/notes",
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
              { label: "Flashcards", sub: "coming soon", agent: "Summarizer", href: null,
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="6" width="14" height="14" rx="1"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/></svg> },
              { label: "Study plan", sub: "coming soon", agent: "Planner", href: null,
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="1"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
            ].map((tile, i) => (
              <QuickTile
                key={tile.label}
                label={tile.label}
                sub={tile.sub}
                agent={tile.agent}
                icon={tile.icon}
                border={i > 0}
                onClick={tile.href ? () => router.push(tile.href!) : undefined}
              />
            ))}
          </div>

          {/* Recent Activity + Agents at work */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28, marginBottom: 48 }}>

            {/* Recent Activity */}
            <div style={{ border: "1px solid var(--border-strong)" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                <span className="sect-num">§ RECENT ACTIVITY</span>
                <span className="sect-num" style={{ marginLeft: "auto" }}>LAST SESSION</span>
              </div>
              {recentMessages.length === 0 ? (
                <div style={{ padding: "24px 18px" }}>
                  <p style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
                    No recent activity yet. Start a chat to see your study history here.
                  </p>
                </div>
              ) : (
                <div>
                  {recentMessages.map((msg, i) => (
                    <div key={i}
                      onClick={() => recentSession && router.push(`/chat?sid=${recentSession.id}`)}
                      style={{
                        display: "grid", gridTemplateColumns: "1fr 60px",
                        gap: 16, padding: "12px 18px",
                        borderBottom: i < recentMessages.length - 1 ? "1px solid var(--border)" : "none",
                        cursor: "pointer", transition: "background .15s", alignItems: "center",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(237,232,220,0.02)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <div style={{ fontSize: 13, color: "var(--cream)", fontFamily: "var(--font-head)", marginBottom: 2, letterSpacing: "0.005em" }}>
                          {msg.content.slice(0, 100)}{msg.content.length > 100 ? "…" : ""}
                        </div>
                        {recentSession && (
                          <div className="sect-num" style={{ fontSize: 9 }}>{recentSession.title.slice(0, 40)}</div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textAlign: "right" }}>
                        {recentSession ? relativeTime(recentSession.created_at) : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Agents at work */}
            <div style={{ border: "1px solid var(--border-strong)" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
                <span className="sect-num">§ AGENTS · THIS SESSION</span>
              </div>
              <div>
                {[
                  { agent: "Advisor", pct: 68, stat: "Q&A · conversations" },
                  { agent: "Summarizer", pct: 42, stat: "docs · cards generated" },
                  { agent: "Planner", pct: 28, stat: "plans · schedules" },
                  { agent: "Coordinator", pct: 92, stat: "always routing" },
                ].map((a, i) => (
                  <div key={a.agent} style={{ padding: "14px 18px", borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <AgentBadge agent={a.agent} />
                    </div>
                    <div style={{ height: 2, background: "rgba(237,232,220,0.06)", marginBottom: 6 }}>
                      <div style={{ width: `${a.pct}%`, height: "100%", background: "var(--cream)" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                      {a.stat}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer colophon */}
          <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <span className="sect-num">{sessions.length} SESSIONS · YOUR STUDY SPACE</span>
            <span className="sect-num">STREAK — KEEP GOING</span>
            <span className="sect-num">ATHENA · MMXXVI</span>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}

function QuickTile({
  label, sub, agent, icon, border, onClick,
}: {
  label: string;
  sub: string;
  agent: string;
  icon: React.ReactNode;
  border?: boolean;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "22px 20px 20px",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderLeft: border ? undefined : "none",
        background: hover && onClick ? "rgba(237,232,220,0.03)" : "transparent",
        cursor: onClick ? "pointer" : "default",
        transition: "all .18s",
        position: "relative", minHeight: 120,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: "var(--cream)" }}>{icon}</div>
        <AgentBadge agent={agent} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontFamily: "var(--font-head)", fontStyle: "italic", color: "var(--cream)", letterSpacing: "-0.005em", marginBottom: 4, lineHeight: 1 }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {sub}
        </div>
      </div>
      {onClick && (
        <div style={{ position: "absolute", bottom: 10, right: 10, fontSize: 11, color: hover ? "var(--cream)" : "var(--text-dim)", transition: "color .15s" }}>→</div>
      )}
    </div>
  );
}
