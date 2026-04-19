"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useUser, useAuth } from "@clerk/nextjs";
import { useEffect, useState, useCallback } from "react";
import type { ChatSessionMeta } from "@/lib/types";
import { listSessions } from "@/lib/api";
import { setCurrentSession } from "@/lib/session";

const NAV_ITEMS = [
  {
    href: "/chat",
    label: "Chat",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
      </svg>
    ),
  },
  {
    href: "/notes",
    label: "Notes",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
      </svg>
    ),
  },
];

function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Load active session id from sessionStorage
  useEffect(() => {
    const id = sessionStorage.getItem("athena_current_session") || 
               sessionStorage.getItem("studyco_current_session");
    if (id) setActiveSessionId(id);
    else setActiveSessionId(null);
  }, [pathname]);

  // Fetch recent sessions list
  const fetchSessions = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await listSessions(token);
      setSessions(data.slice(0, 10));
    } catch {
      // Silently fail — sidebar sessions are non-critical
    }
  }, [getToken]);

  useEffect(() => {
    fetchSessions();
    // Refresh every 30s while sidebar is visible
    const interval = setInterval(fetchSessions, 30_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // New Chat
  const handleNewChat = useCallback(() => {
    sessionStorage.removeItem("athena_current_session");
    sessionStorage.removeItem("studyco_current_session");
    setActiveSessionId(null);
    router.push("/chat");
    // If already on chat, the key/mount check in chat/page.tsx will handle the reset
  }, [router]);

  // Click on a past session
  const handleSessionClick = useCallback(
    (session: ChatSessionMeta) => {
      setCurrentSession(session.id);
      setActiveSessionId(session.id);
      router.push("/chat");
    },
    [router]
  );

  return (
    <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-border bg-surface flex flex-col z-40 hidden md:flex">
      <div className="px-5 pt-8 pb-6">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-[10px] transition-transform group-hover:scale-105">
            A
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight">
            Athena
          </span>
        </Link>
      </div>

      <div className="px-3 mb-2">
        <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em] px-2 block select-none">
          Navigate
        </span>
      </div>

      <nav className="px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all ${
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted hover:bg-white/[0.03] hover:text-foreground"
              }`}
            >
              <span className={isActive ? "text-primary" : "text-muted"}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Recent sessions */}
      <div className="mt-5 px-3 mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted/60 uppercase tracking-[0.15em] px-2 select-none">
          Recent
        </span>
        <button
          id="sidebar-new-chat"
          onClick={handleNewChat}
          title="New Chat"
          className="p-1 rounded-md text-muted hover:text-foreground hover:bg-white/[0.04] transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      <div className="flex-1 px-3 overflow-y-auto space-y-0.5">
        {sessions.length === 0 ? (
          <p className="px-2 text-[11px] text-muted/40 mt-1">No chats yet</p>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === activeSessionId;
            return (
              <button
                key={s.id}
                onClick={() => handleSessionClick(s)}
                className={`w-full text-left flex flex-col rounded-lg px-2.5 py-2 transition-all ${
                  isActive
                    ? "bg-primary/8 border-l-2 border-primary pl-2"
                    : "text-muted hover:bg-white/[0.03] hover:text-foreground border-l-2 border-transparent"
                }`}
              >
                <span className={`text-[12px] font-medium truncate ${isActive ? "text-primary" : "text-foreground/80"}`}>
                  {s.title.slice(0, 30)}{s.title.length > 30 ? "…" : ""}
                </span>
                <span className="text-[10px] text-muted/50 mt-0.5">
                  {relativeTime(s.created_at)}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="p-4 border-t border-border mt-auto">
        <div className="flex items-center gap-3">
          <UserButton showName={false} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate leading-tight">
              {user?.firstName ?? "Student"}
            </p>
            <p className="text-[11px] text-muted truncate leading-tight mt-0.5">
              {user?.emailAddresses[0]?.emailAddress ?? ""}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
