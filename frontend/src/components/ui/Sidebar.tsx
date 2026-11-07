"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useUser, useAuth } from "@clerk/nextjs";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import type { ChatSessionMeta } from "@/lib/types";
import { listSessions, deleteSession } from "@/lib/api";
import { setCurrentSession } from "@/lib/session";
import Logo from "./Logo";
import { SkeletonRows } from "./Skeleton";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>
      </svg>
    ),
  },
  {
    href: "/chat",
    label: "Chat",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    href: "/notes",
    label: "Notes",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="14" height="14" rx="1"/>
        <path d="M7 3h12a2 2 0 0 1 2 2v12"/>
      </svg>
    ),
  },
  {
    href: "/studyplan",
    label: "Study plan",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="1"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
];

const CURRENT_KEY = "athena_current_session";
const LEGACY_KEY = "studyco_current_session";

// ── Undoable delete ─────────────────────────────────────────
// A deleted chat waits here for UNDO_MS before the server delete runs, so it
// can be taken back. This lives at module level because every page renders
// its own Sidebar: moving to another page must neither cancel nor lose it.

const UNDO_MS = 5000;

interface PendingDelete {
  session: ChatSessionMeta;
  index: number;
  wasActive: boolean;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<void>;
}

let store: { pending: PendingDelete | null; version: number } = { pending: null, version: 0 };
const listeners = new Set<() => void>();

function setPending(pending: PendingDelete | null) {
  store = { pending, version: store.version + 1 };
  listeners.forEach((l) => l());
}
function bump() {
  store = { ...store, version: store.version + 1 };
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const getStore = () => store;
const getServerStore = () => store;

/** Run the pending delete now (timer fired, or a newer delete replaced it). */
function flushPending() {
  const p = store.pending;
  if (!p) return;
  clearTimeout(p.timer);
  setPending(null);
  // Refresh lists afterwards; on failure the chat simply reappears.
  p.run().catch(() => {}).finally(bump);
}

/** Cancel the pending delete and hand back the chat. */
function undoPending(): PendingDelete | null {
  const p = store.pending;
  if (!p) return null;
  clearTimeout(p.timer);
  setPending(null);
  return p;
}

// ────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diffMins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60_000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return `${Math.floor(diffDays / 7)}w`;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { pending, version } = useSyncExternalStore(subscribe, getStore, getServerStore);

  useEffect(() => {
    const id = sessionStorage.getItem(CURRENT_KEY) || sessionStorage.getItem(LEGACY_KEY);
    setActiveSessionId(id || null);
  }, [pathname]);

  const fetchSessions = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await listSessions(token);
      const hiddenId = store.pending?.session.id;
      setSessions(data.filter((s) => s.id !== hiddenId).slice(0, 10));
    } catch { /* silent */ }
    finally { setLoaded(true); }
  }, [getToken]);

  // Initial load, and again whenever a delete is committed or undone.
  useEffect(() => { fetchSessions(); }, [fetchSessions, version]);

  useEffect(() => {
    const interval = setInterval(fetchSessions, 30_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/sessions/empty`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
        );
        await fetchSessions();
      } catch { /* silent */ }
    })();
  }, [getToken, fetchSessions]);

  const handleNewChat = useCallback(() => {
    sessionStorage.removeItem(CURRENT_KEY);
    sessionStorage.removeItem(LEGACY_KEY);
    setActiveSessionId(null);
    router.push("/chat?new=" + Date.now());
  }, [router]);

  const handleSessionClick = useCallback((session: ChatSessionMeta) => {
    setCurrentSession(session.id);
    setActiveSessionId(session.id);
    router.push("/chat?sid=" + session.id);
  }, [router]);

  const handleDelete = (e: React.MouseEvent, session: ChatSessionMeta) => {
    e.stopPropagation();
    e.preventDefault();
    flushPending(); // one undo at a time: commit any earlier delete now

    const index = sessions.findIndex((s) => s.id === session.id);
    const wasActive = sessionStorage.getItem(CURRENT_KEY) === session.id;
    setSessions((prev) => prev.filter((s) => s.id !== session.id));

    setPending({
      session,
      index,
      wasActive,
      expiresAt: Date.now() + UNDO_MS,
      timer: setTimeout(flushPending, UNDO_MS),
      run: async () => {
        const token = await getToken();
        if (!token) throw new Error("Auth failed");
        await deleteSession(session.id, token);
      },
    });

    if (wasActive) {
      sessionStorage.removeItem(CURRENT_KEY);
      router.push("/chat?new=" + Date.now());
    }
  };

  const handleUndo = () => {
    const p = undoPending();
    if (!p) return;
    setSessions((prev) => {
      if (prev.some((s) => s.id === p.session.id)) return prev;
      const next = [...prev];
      next.splice(Math.max(0, Math.min(p.index, next.length)), 0, p.session);
      return next;
    });
    if (p.wasActive) handleSessionClick(p.session);
  };

  const userInitial = user?.firstName?.[0]?.toUpperCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "A";
  const userName = user?.firstName ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : "Student";

  return (
    <>
      <aside
        className="hidden md:flex flex-col shrink-0 sticky top-0 z-40 h-screen w-[248px] py-[18px] border-r border-line"
        style={{ background: "rgba(237,232,220,0.012)" }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-[18px] pt-0.5 pb-3.5">
          <Link href="/" className="no-underline"><Logo /></Link>
          <span className="label text-[10px]">v4.0</span>
        </div>

        {/* New Chat */}
        <div className="px-3 pb-2.5 mb-2.5 border-b border-line">
          <button id="sidebar-new-chat" onClick={handleNewChat} className="btn btn-primary btn-block justify-start text-[13.5px] py-2.5 px-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Chat
            <span className="ml-auto flex gap-0.5">
              <span className="kbd" style={{ background: "rgba(0,0,0,0.12)", borderColor: "rgba(0,0,0,0.2)", color: "rgba(10,10,12,0.7)" }}>⌘</span>
              <span className="kbd" style={{ background: "rgba(0,0,0,0.12)", borderColor: "rgba(0,0,0,0.2)", color: "rgba(10,10,12,0.7)" }}>K</span>
            </span>
          </button>
        </div>

        {/* Nav */}
        <nav className="px-3">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.label} href={item.href} className={`nav-item ${active ? "is-active" : ""}`}>
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Recent sessions */}
        <div className="px-[18px] pt-5 pb-2">
          <span className="label text-[10.5px]">§ Recent</span>
        </div>

        <div className="flex-1 overflow-auto px-3">
          {!loaded ? (
            <SkeletonRows rows={5} meta={false} className="px-3" />
          ) : sessions.length === 0 ? (
            <p className="text-meta px-3 py-1">No chats yet</p>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === activeSessionId && pathname === "/chat";
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSessionClick(s)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSessionClick(s); } }}
                  className={`session-row nav-item text-[13.5px] py-[7px] cursor-pointer ${isActive ? "is-active" : ""}`}
                >
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="shrink-0 text-[11px] text-dim">{relativeTime(s.created_at)}</span>
                  <button
                    type="button"
                    className="row-delete"
                    aria-label={`Delete chat “${s.title}”`}
                    onClick={(e) => handleDelete(e, s)}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* User */}
        <div className="p-3 border-t border-line">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="avatar avatar-sm">{userInitial}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-cream font-medium leading-tight truncate">{userName}</div>
              <div className="text-[11.5px] text-dim mt-0.5 truncate">
                {user?.emailAddresses?.[0]?.emailAddress ?? "Student"}
              </div>
            </div>
            <UserButton showName={false} />
          </div>
        </div>
      </aside>

      {pending && (
        <UndoToast key={pending.session.id} pending={pending} onUndo={handleUndo} />
      )}
    </>
  );
}

function UndoToast({ pending, onUndo }: { pending: PendingDelete; onUndo: () => void }) {
  // Remaining time, so the bar is right even if this mounted mid-countdown
  // (e.g. after switching pages).
  const [remaining] = useState(() => Math.max(0, pending.expiresAt - Date.now()));
  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="truncate max-w-[220px]">
        Deleted <span className="text-cream-dim">“{pending.session.title}”</span>
      </span>
      <button type="button" onClick={onUndo} className="btn btn-ghost btn-sm">Undo</button>
      <span
        className="toast-timer"
        style={{ animationDuration: `${UNDO_MS}ms`, animationDelay: `-${UNDO_MS - remaining}ms` }}
      />
    </div>
  );
}
