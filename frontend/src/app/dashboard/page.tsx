"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import DashboardLayout from "@/components/ui/DashboardLayout";
import AgentBadge from "@/components/ui/AgentBadge";
import Skeleton, { SkeletonRows } from "@/components/ui/Skeleton";
import type { ChatSessionMeta, ChatMessage } from "@/lib/types";
import {
  listSessions,
  getSessionMessages,
  getMemoryProfile,
} from "@/lib/api";

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
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${days[d.getDay()]}`;
}

/** "Weak area: photosynthesis (quiz score 3/5). Missed: …" -> "photosynthesis · 3/5" */
function formatWeakArea(entry: string): string {
  const quiz = entry.match(/^Weak area:\s*(.+?)\s*\(quiz score (\d+)\/(\d+)\)/);
  if (quiz) return `${quiz[1]} · ${quiz[2]}/${quiz[3]}`;
  return entry.replace(/^Challenging topic:\s*/, "");
}

type MemoryProfile = {
  preferences: string[];
  weak_subjects: string[];
  recent_topics: string[];
};

export default function DashboardPage() {
  const router = useRouter();
  const { getToken } = useAuth();

  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([]);
  const [recentSession, setRecentSession] = useState<ChatSessionMeta | null>(null);
  const [activityLoaded, setActivityLoaded] = useState(false);

  const [memoryProfile, setMemoryProfile] = useState<MemoryProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const summaryFetchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchSessions() {
      try {
        const token = await getToken();
        if (cancelled) return;
        if (!token) { setSessionsLoaded(true); return; }
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
    if (sessions.length === 0) {
      // Nothing to look up: show the empty states straight away.
      setActivityLoaded(true);
      setProfileLoaded(true);
      return;
    }

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
      finally { setActivityLoaded(true); }
    }
    fetchRecentActivity();

    getToken()
      .then((tok) => (tok ? getMemoryProfile(tok).then(setMemoryProfile) : undefined))
      .catch(() => {})
      .finally(() => setProfileLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsLoaded]);

  const filteredPreferences = memoryProfile?.preferences
    .map(p => p.replace(/\*\*/g, ""))
    .filter(p => p.length >= 20)
    .filter(p => !/generate|study plan|flashcard|quiz/i.test(p)) || [];

  const filteredWeakSubjects = memoryProfile?.weak_subjects
    .map(s => s.replace(/\*\*/g, ""))
    .filter(s => s.length >= 10)
    // Word boundaries: a bare /hi/ also hid "Machine learning", "history"…
    .filter(s => !/\b(?:my name|nickname|hello|hi)\b/i.test(s))
    .map(formatWeakArea) || [];

  const filteredTopics = memoryProfile?.recent_topics
    .filter(t => t.startsWith("Topic:"))
    .map(t => t.replace("Topic:", "").replace(/\*\*/g, "").trim())
    .slice(0, 5) || [];

  const greeting = getGreeting();

  const profileCells: { title: string; icon: React.ReactNode; items: string[]; max: number; empty: string; strong?: boolean }[] = [
    {
      title: "Study style", items: filteredPreferences.slice(0, 4), max: 50, empty: "Still learning…",
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>,
    },
    {
      title: "Weak areas", items: filteredWeakSubjects.slice(0, 4), max: 40, empty: "None flagged yet", strong: true,
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    },
    {
      title: "Recent topics", items: filteredTopics, max: 40, empty: "No topics yet",
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
    },
  ];

  return (
    <DashboardLayout>
      <div className="page-scroll">

        {/* Subtle orbital backdrop */}
        <div className="pointer-events-none absolute top-0 right-0 z-0 h-[720px] w-[720px]">
          <div className="absolute" style={{
            width: 900, height: 900, top: -300, right: -200,
            background: "radial-gradient(circle, rgba(237,232,220,0.04), transparent 70%)",
          }} />
          <svg width="720" height="720" viewBox="0 0 720 720" className="absolute inset-0 opacity-50">
            <g style={{ transformOrigin: "460px 260px", animation: "athenaSpin 180s linear infinite" }}>
              {[180, 260, 340].map((r, i) => (
                <ellipse key={i} cx="460" cy="260" rx={r} ry={r * 0.35}
                  fill="none" stroke="#ede8dc" strokeOpacity={0.06 + i * 0.01} strokeWidth="0.8" />
              ))}
            </g>
            <circle cx="460" cy="260" r="2" fill="#ede8dc" opacity="0.4" />
          </svg>
        </div>

        <div className="page-pad">

          {/* Running header */}
          <div className="running-head">
            <span className="label">§ Dashboard</span>
            <span className="label">{formatHeaderDate()}</span>
            <span className="label">Athena · MMXXVI</span>
          </div>

          {/* Greeting block */}
          <div className="mb-8 pt-1">
            <div className="eyebrow mb-4">
              {!sessionsLoaded
                ? <Skeleton width={220} height={11} />
                : sessions.length > 0 && recentSession
                  ? <><span className="text-cream">{recentSession.title.slice(0, 40)}</span> · last session</>
                  : "Start your first session today"
              }
            </div>
            <h1 className="h-xl mb-[18px]">
              {greeting},<br />
              <em className="serif-i">student.</em>
            </h1>
            <div className="text-body mb-6 max-w-[500px]">
              {!sessionsLoaded ? (
                <div className="flex flex-col gap-2 py-1">
                  <Skeleton width="90%" height={13} />
                  <Skeleton width="60%" height={13} />
                </div>
              ) : sessions.length > 0
                ? `You have ${sessions.length} chat session${sessions.length > 1 ? "s" : ""} saved. Pick up where you left off or start something new.`
                : "Ask anything. Athena will help you study smarter, summarize your notes, and build a study plan."
              }
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => { sessionStorage.removeItem("athena_current_session"); router.push("/chat"); }}
                className="btn btn-primary"
              >
                {sessions.length > 0 ? "Resume session →" : "Start chatting →"}
              </button>
              <button onClick={() => router.push("/notes")} className="btn btn-ghost">
                Upload lecture
              </button>
            </div>
          </div>

          {/* Memory Profile */}
          <div className="panel mb-7">
            <div className="panel-head">
              <span className="label">§ Memory profile</span>
              <span className="text-meta">what Athena remembers about how you learn</span>
              <span className="label ml-auto">Updated this session</span>
            </div>
            <div className="grid grid-cols-4">
              {profileCells.map((cell) => (
                <div key={cell.title} className="min-h-[140px] border-r border-line px-5 py-[18px]">
                  <div className="mb-3 flex items-center gap-2 text-cream">
                    {cell.icon}
                    <span className="label label-strong">{cell.title}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {!profileLoaded ? (
                      <>
                        <Skeleton width="80%" height={24} />
                        <Skeleton width="55%" height={24} />
                      </>
                    ) : cell.items.length > 0 ? cell.items.map((t, i) => (
                      <span key={i} className={`tag ${cell.strong ? "tag-strong" : ""}`}>
                        {t.slice(0, cell.max)}{t.length > cell.max ? "…" : ""}
                      </span>
                    )) : (
                      <span className="text-meta text-dim">{cell.empty}</span>
                    )}
                  </div>
                </div>
              ))}
              {/* Sessions */}
              <div className="min-h-[140px] px-5 py-[18px]">
                <div className="mb-3 flex items-center gap-2 text-cream">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span className="label label-strong">Sessions</span>
                </div>
                {!sessionsLoaded ? (
                  <Skeleton width={48} height={34} />
                ) : (
                  <div className="serif-i mb-1.5 text-[34px] leading-none">{sessions.length}</div>
                )}
                <div className="label mt-1.5">total chats</div>
              </div>
            </div>
          </div>

          {/* Quick tiles */}
          <div className="mb-7 grid grid-cols-4 border-t border-line">
            {[
              { label: "Chat", sub: `${sessions.length} sessions`, agent: "Advisor", href: "/chat",
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
              { label: "Notes", sub: "Summarize files", agent: "Summarizer", href: "/notes",
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
              { label: "Flashcards", sub: "10 / 20 / 30 cards", agent: "Flashcard", href: "/flashcards",
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="6" width="14" height="14" rx="1"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/></svg> },
              { label: "Study plan", sub: "Exam schedule", agent: "Planner", href: "/studyplan",
                icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="1"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
            ].map((tile) => (
              <QuickTile
                key={tile.label}
                label={tile.label}
                sub={tile.sub}
                agent={tile.agent}
                icon={tile.icon}
                onClick={() => router.push(tile.href)}
              />
            ))}
          </div>

          {/* Recent Activity + Agents at work */}
          <div className="mb-12 grid grid-cols-[1.4fr_1fr] gap-7">

            {/* Recent Activity */}
            <div className="panel">
              <div className="panel-head">
                <span className="label">§ Recent activity</span>
                <span className="label ml-auto">Last session</span>
              </div>
              {!activityLoaded ? (
                <SkeletonRows rows={3} className="px-[18px] py-1.5" />
              ) : recentMessages.length === 0 ? (
                <p className="text-note px-[18px] py-6">
                  No recent activity yet. Start a chat to see your study history here.
                </p>
              ) : (
                <div className="divider-row">
                  {recentMessages.map((msg, i) => (
                    <div key={i}
                      onClick={() => recentSession && router.push(`/chat?sid=${recentSession.id}`)}
                      className="row-hover grid grid-cols-[1fr_70px] items-center gap-4 px-[18px] py-3"
                    >
                      <div className="min-w-0">
                        <div className="mb-0.5 truncate text-[14.5px] text-cream">
                          {msg.content.slice(0, 100)}{msg.content.length > 100 ? "…" : ""}
                        </div>
                        {recentSession && (
                          <div className="text-meta truncate text-dim">{recentSession.title.slice(0, 40)}</div>
                        )}
                      </div>
                      <div className="text-meta text-right">
                        {recentSession ? relativeTime(recentSession.created_at) : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Agents at work */}
            <div className="panel">
              <div className="panel-head">
                <span className="label">§ Agents · this session</span>
              </div>
              <div className="divider-row">
                {[
                  { agent: "Advisor", pct: 68, stat: "Q&A · conversations" },
                  { agent: "Summarizer", pct: 42, stat: "Docs · cards generated" },
                  { agent: "Planner", pct: 28, stat: "Plans · schedules" },
                  { agent: "Coordinator", pct: 92, stat: "Always routing" },
                ].map((a) => (
                  <div key={a.agent} className="px-[18px] py-3.5">
                    <div className="mb-2 flex items-center gap-2.5">
                      <AgentBadge agent={a.agent} />
                    </div>
                    <div className="progress mb-1.5"><span style={{ width: `${a.pct}%` }} /></div>
                    <div className="text-meta">{a.stat}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer colophon */}
          <div className="flex justify-between border-t border-line pt-4">
            <span className="label">{sessions.length} sessions · your study space</span>
            <span className="label">Streak — keep going</span>
            <span className="label">Athena · MMXXVI</span>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}

function QuickTile({
  label, sub, agent, icon, onClick,
}: {
  label: string;
  sub: string;
  agent: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} className={`tile ${onClick ? "is-link" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="text-cream">{icon}</div>
        <AgentBadge agent={agent} />
      </div>
      <div>
        <div className="serif-i mb-1 text-[26px] leading-none">{label}</div>
        <div className="text-meta">{sub}</div>
      </div>
      {onClick && <div className="tile-arrow">→</div>}
    </div>
  );
}
