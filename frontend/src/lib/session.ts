// ─── Session Management ───────────────────────────────────
// user_id  — sourced from Clerk's authenticated userId
// session_id — UUID persisted in sessionStorage (resets on tab close)

"use client";

import { useRef } from "react";
import { useAuth } from "@clerk/nextjs";

const SESSION_KEY = "studyco_session_id";

export function getSessionId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function resetSession(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

const CURRENT_SESSION_KEY = "athena_current_session";

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  let id = sessionStorage.getItem(CURRENT_SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(CURRENT_SESSION_KEY, id);
  }
  return id;
}

export function setCurrentSession(id: string): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(CURRENT_SESSION_KEY, id);
    // Clean up legacy key
    sessionStorage.removeItem("studyco_current_session");
  }
}

/** Clears the current session so the next message starts a fresh one. */
export function resetCurrentSession(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(CURRENT_SESSION_KEY);
    sessionStorage.removeItem("studyco_current_session");
  }
}

export interface Session {
  user_id: string;
  session_id: string;
}

/**
 * useSession — call at the top of any component that needs
 * user_id / session_id. Passes Clerk's userId as user_id.
 * session_id is stable for the browser tab lifetime.
 */
export function useSession(): Session {
  const { userId } = useAuth();
  // Stable session_id across renders — created once per tab
  const sessionIdRef = useRef<string>(getSessionId());

  return {
    user_id: userId ?? "",
    session_id: sessionIdRef.current,
  };
}
