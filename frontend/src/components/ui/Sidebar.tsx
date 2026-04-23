"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useUser, useAuth } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";
import type { ChatSessionMeta } from "@/lib/types";
import { listSessions, deleteSession } from "@/lib/api";
import { setCurrentSession, resetCurrentSession } from "@/lib/session";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Chat",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    href: "/notes",
    label: "Notes",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="8" y1="13" x2="16" y2="13"/>
        <line x1="8" y1="17" x2="14" y2="17"/>
      </svg>
    ),
  },
  {
    href: "/flashcards",
    label: "Flashcards",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="14" height="14" rx="1"/>
        <path d="M7 3h12a2 2 0 0 1 2 2v12"/>
      </svg>
    ),
  },
];

const SOON_ITEMS = [
  {
    label: "Study plan",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="1"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
];

function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "NOW";
  if (diffMins < 60) return `${diffMins}M`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}H`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}D`;
  return `${Math.floor(diffDays / 7)}W`;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const id = sessionStorage.getItem("athena_current_session") ||
               sessionStorage.getItem("studyco_current_session");
    setActiveSessionId(id || null);
  }, [pathname]);

  const fetchSessions = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await listSessions(token);
      setSessions(data.slice(0, 10));
    } catch { /* silent */ }
  }, [getToken]);

  const cleanupEmpty = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/sessions/empty`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchSessions();
    } catch { /* silent */ }
  }, [getToken, fetchSessions]);

  useEffect(() => {
    fetchSessions();
    cleanupEmpty();
    const interval = setInterval(fetchSessions, 30_000);
    return () => clearInterval(interval);
  }, [fetchSessions, cleanupEmpty]);

  const handleNewChat = useCallback(() => {
    sessionStorage.removeItem("athena_current_session");
    sessionStorage.removeItem("studyco_current_session");
    setActiveSessionId(null);
    router.push("/chat?new=" + Date.now());
  }, [router]);

  const handleSessionClick = useCallback((session: ChatSessionMeta) => {
    setCurrentSession(session.id);
    setActiveSessionId(session.id);
    router.push("/chat?sid=" + session.id);
  }, [router]);

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeletingId(sessionId);
    try {
      const token = await getToken();
      if (!token) return;
      await deleteSession(sessionId, token);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      const currentId = sessionStorage.getItem("athena_current_session");
      if (currentId === sessionId) {
        sessionStorage.removeItem("athena_current_session");
        router.push("/chat?new=" + Date.now());
      }
    } catch (err) {
      console.error("[DELETE] failed:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const userInitial = user?.firstName?.[0]?.toUpperCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "A";
  const userName = user?.firstName ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : "Student";

  return (
    <aside style={{
      width: 240,
      flexShrink: 0,
      height: "100vh",
      borderRight: "1px solid var(--border)",
      background: "rgba(237,232,220,0.012)",
      display: "flex",
      flexDirection: "column",
      padding: "18px 0",
      position: "sticky",
      top: 0,
      zIndex: 40,
    }}
    className="hidden md:flex"
    >
      {/* Logo */}
      <div style={{ padding: "2px 18px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14.5" stroke="#ede8dc" strokeWidth="1" fill="none" opacity="0.5" />
            <path d="M16 5 L27 16 L16 27 L5 16 Z" stroke="#ede8dc" strokeWidth="1" fill="none" />
            <circle cx="16" cy="16" r="3" fill="#ede8dc" />
            <circle cx="16" cy="16" r="1" fill="#0a0a0c" />
            <line x1="16" y1="1" x2="16" y2="4" stroke="#ede8dc" strokeWidth="1" />
            <line x1="16" y1="28" x2="16" y2="31" stroke="#ede8dc" strokeWidth="1" />
          </svg>
          <span style={{ fontFamily: "var(--font-head)", fontWeight: 400, fontSize: 15, color: "var(--cream)", lineHeight: 1 }}>
            Athena
          </span>
        </Link>
        <span className="sect-num" style={{ fontSize: 9 }}>v4.0</span>
      </div>

      {/* New Chat */}
      <div style={{ padding: "0 12px 10px", borderBottom: "1px solid var(--border)", marginBottom: 10 }}>
        <button
          id="sidebar-new-chat"
          onClick={handleNewChat}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            background: "var(--cream)",
            color: "#0a0a0c",
            fontSize: 11,
            fontWeight: 500,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            border: "none",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Chat
          <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
            <span className="kbd" style={{ background: "rgba(0,0,0,0.12)", borderColor: "rgba(0,0,0,0.2)", color: "rgba(10,10,12,0.7)" }}>⌘</span>
            <span className="kbd" style={{ background: "rgba(0,0,0,0.12)", borderColor: "rgba(0,0,0,0.2)", color: "rgba(10,10,12,0.7)" }}>K</span>
          </span>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ padding: "0 12px" }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link key={item.label} href={item.href} style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                fontSize: 12.5,
                fontWeight: active ? 500 : 400,
                color: active ? "var(--cream)" : "var(--text-muted)",
                background: active ? "rgba(237,232,220,0.05)" : "transparent",
                borderLeft: active ? "1.5px solid var(--cream)" : "1.5px solid transparent",
                transition: "all .15s",
                cursor: "pointer",
              }}>
                {item.icon}
                {item.label}
                {active && <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--cream-mute)" }}>·</span>}
              </div>
            </Link>
          );
        })}
        {SOON_ITEMS.map((item) => (
          <div key={item.label} style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            fontSize: 12.5,
            color: "var(--text-dim)",
            borderLeft: "1.5px solid transparent",
            cursor: "default",
          }}>
            {item.icon}
            {item.label}
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.1em" }}>SOON</span>
          </div>
        ))}
      </nav>

      {/* Recent sessions */}
      <div style={{ padding: "20px 18px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="sect-num" style={{ fontSize: 9 }}>§ RECENT</span>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "0 12px" }}>
        {sessions.length === 0 ? (
          <p style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>
            No chats yet
          </p>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === activeSessionId && pathname === "/chat";
            return (
              <div key={s.id}
                onClick={deletingId ? undefined : () => handleSessionClick(s)}
                onMouseEnter={() => setHoveredId(s.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  padding: "7px 12px",
                  fontSize: 12,
                  cursor: deletingId ? "default" : "pointer",
                  background: isActive ? "rgba(237,232,220,0.05)" : "transparent",
                  borderLeft: isActive ? "1.5px solid var(--cream)" : "1.5px solid transparent",
                  color: isActive ? "var(--cream)" : "var(--text-muted)",
                  fontWeight: isActive ? 500 : 400,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all .15s",
                  position: "relative",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {s.title.slice(0, 28)}{s.title.length > 28 ? "…" : ""}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-dim)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", flexShrink: 0 }}>
                  {relativeTime(s.created_at)}
                </span>
                <span
                  onClick={(e) => handleDeleteSession(e, s.id)}
                  role="button"
                  aria-label="Delete session"
                  style={{
                    position: "absolute",
                    right: 6,
                    opacity: hoveredId === s.id || deletingId === s.id ? 1 : 0,
                    fontSize: 13,
                    color: "rgba(237,232,220,0.5)",
                    cursor: "pointer",
                    padding: "2px 5px",
                    transition: "opacity .15s",
                    lineHeight: 1,
                    userSelect: "none",
                  }}
                >
                  {deletingId === s.id ? (
                    <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>…</span>
                  ) : (
                    <span>×</span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* User */}
      <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px" }}>
          <div style={{
            width: 28,
            height: 28,
            border: "1px solid var(--cream-ghost)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--cream)",
            fontSize: 13,
            fontFamily: "var(--font-head)",
            fontStyle: "italic",
            flexShrink: 0,
          }}>
            {userInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "var(--cream)", fontFamily: "var(--font-head)", fontStyle: "italic", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userName}
            </div>
            <div style={{ fontSize: 9, color: "var(--text-dim)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.emailAddresses?.[0]?.emailAddress ?? "Student"}
            </div>
          </div>
          <UserButton showName={false} />
        </div>
      </div>
    </aside>
  );
}
