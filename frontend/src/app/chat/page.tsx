"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import DashboardLayout from "@/components/ui/DashboardLayout";
import AgentBadge from "@/components/ui/AgentBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ErrorBanner from "@/components/ui/ErrorBanner";
import FlashcardDeck from "@/components/chat/FlashcardDeck";
import type { ChatMessage, LoadingState } from "@/lib/types";
import {
  sendChatMessageStream,
  createSession,
  getSessionMessages,
  saveMessage,
} from "@/lib/api";
import { useSession, setCurrentSession, resetCurrentSession } from "@/lib/session";
import { renderWithLatex } from "@/lib/renderMarkdown";

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
            <LoadingSpinner size="lg" label="Loading chat…" />
          </div>
        </DashboardLayout>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSlash, setShowSlash] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const session = useSession();
  const { getToken } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    setShowSlash(input.startsWith("/"));
  }, [input]);

  // ── On mount / URL change: load session ─────────────────
  useEffect(() => {
    let cancelled = false;
    const sidParam = searchParams.get("sid");
    const newParam = searchParams.get("new");

    if (newParam) {
      if (!cancelled) {
        setMessages([]);
        setLoadingState("idle");
        setError(null);
        setCurrentSessionId(null);
        resetCurrentSession();
      }
      return;
    }

    const storedId = sessionStorage.getItem("athena_current_session");
    const targetId = sidParam || storedId;

    const pending = sessionStorage.getItem("athena_pending_query");
    if (pending) {
      sessionStorage.removeItem("athena_pending_query");
      pendingQueryRef.current = pending;
    }

    async function initSession() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        if (targetId) {
          setCurrentSession(targetId);
          setCurrentSessionId(targetId);
          try {
            const msgs = await getSessionMessages(targetId, token);
            if (!cancelled) setMessages(msgs);
          } catch {
            if (!cancelled) { resetCurrentSession(); setCurrentSessionId(null); }
          }
        } else {
          if (!cancelled) setCurrentSessionId(null);
        }
        if (!cancelled && pendingQueryRef.current) {
          const q = pendingQueryRef.current;
          pendingQueryRef.current = null;
          setTimeout(() => handleSendRef.current?.(q), 80);
        }
      } catch {
        if (!cancelled) setError("Connection failed");
      }
    }

    initSession();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleNewChat = useCallback(() => {
    resetCurrentSession();
    setMessages([]);
    setLoadingState("idle");
    setError(null);
    setCurrentSessionId(null);
    router.push("/chat?new=" + Date.now());
  }, [router]);

  const exportChatAsMarkdown = useCallback(() => {
    const lines: string[] = ["# Athena Chat", `*Exported — ${new Date().toLocaleDateString()}*`, ""];
    messages.forEach((msg) => {
      lines.push(msg.role === "user" ? `**You:** ${msg.content}` : `**Athena:** ${msg.content}`);
      if (msg.agent) lines.push(`*Agent: ${msg.agent}*`);
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `athena-chat-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  const handleSend = useCallback(async (overrideInput?: string) => {
    const trimmed = (overrideInput ?? input).trim();
    if (!trimmed || loadingState === "loading") return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setLoadingState("loading");
    setError(null);

    let finalContent = "";
    let finalAgent = "";
    let activeSessionId = currentSessionId;

    if (!activeSessionId) {
      try {
        const token = await getToken();
        if (!token) throw new Error("Auth failed");
        const newSession = await createSession(token);
        activeSessionId = newSession.id;
        setCurrentSession(newSession.id);
        setCurrentSessionId(newSession.id);
      } catch {
        setError("Could not initialize session");
        setLoadingState("idle");
        return;
      }
    }

    await sendChatMessageStream(
      { session_id: activeSessionId as string, input: trimmed },
      await getToken() as string,
      (token) => {
        finalContent += token;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: updated[updated.length - 1].content + token };
          return updated;
        });
      },
      (meta) => {
        finalAgent = meta.agent;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], agent: meta.agent, flashcards: meta.flashcards };
          return updated;
        });
        setLoadingState("success");
        getToken().then((tok) => {
          if (!tok || !activeSessionId) return;
          saveMessage(activeSessionId, { role: "user", content: trimmed }, tok).catch(() => {});
          saveMessage(activeSessionId, { role: "assistant", content: finalContent, agent: finalAgent }, tok).catch(() => {});
        });
      },
      (errorMessage) => { setError(errorMessage); setLoadingState("error"); }
    );
  }, [input, loadingState, session, currentSessionId, getToken]);

  const handleSendRef = useRef(handleSend);
  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const slashCommands = [
    { cmd: "/plan", desc: "Generate a study plan for an upcoming exam" },
    { cmd: "/summarize", desc: "Summarize a PDF, link, or pasted text" },
    { cmd: "/flashcards", desc: "Create spaced-repetition cards from notes" },
    { cmd: "/quiz", desc: "Quiz me on topics I'm weak at" },
    { cmd: "/explain", desc: "Explain a concept step-by-step" },
    { cmd: "/solve", desc: "Work through a problem together" },
  ];

  return (
    <DashboardLayout>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", position: "relative" }}>

        {/* Chat Header */}
        <header style={{
          padding: "14px 28px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(10,10,12,0.7)",
          backdropFilter: "blur(8px)",
          position: "sticky", top: 0, zIndex: 30,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="sect-num">§ SESSION</span>
            <h2 style={{ fontSize: 17, fontFamily: "var(--font-head)", fontStyle: "italic", fontWeight: 400, color: "var(--cream)", letterSpacing: "0.005em", margin: 0 }}>
              {messages.length > 0 ? "Conversation" : "New chat"}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="sect-num">{messages.length} MESSAGES</span>
            {messages.length > 0 && (
              <button
                id="export-chat-btn"
                onClick={exportChatAsMarkdown}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", fontSize: 10,
                  color: "var(--text-muted)", background: "transparent",
                  border: "1px solid var(--border)", cursor: "pointer",
                  fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase",
                  transition: "all .15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--cream)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export
              </button>
            )}
            <button
              id="new-chat-btn"
              onClick={handleNewChat}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", fontSize: 10,
                color: "var(--text-muted)", background: "transparent",
                border: "1px solid var(--border)", cursor: "pointer",
                fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase",
                transition: "all .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--cream)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New
            </button>
          </div>
        </header>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 120px" }}>
          <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Date divider */}
            {messages.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span className="sect-num">TODAY</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
            )}

            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg}
                userInitial={user?.firstName?.[0]?.toUpperCase() ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "U"}
              />
            ))}

            {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Welcome state */}
        {messages.length === 0 && loadingState !== "loading" && (
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            maxWidth: 560, width: "100%", padding: "0 28px",
            textAlign: "center", pointerEvents: "none",
          }}>
            <div className="glow-radial" style={{
              width: 600, height: 600, top: -200, left: "50%", transform: "translateX(-50%)",
              background: "radial-gradient(circle, rgba(237,232,220,0.04), transparent 70%)",
            }} />
            <h1 style={{
              fontSize: 64, lineHeight: 0.95,
              fontFamily: "var(--font-head)", fontWeight: 400,
              letterSpacing: "-0.02em", color: "var(--cream)",
              marginBottom: 16,
            }}>
              What are<br />
              <em style={{ fontFamily: "var(--font-head)", fontStyle: "italic" }}>we studying</em><br />
              today?
            </h1>
            <p style={{ fontSize: 15, color: "var(--cream-dim)", lineHeight: 1.5, fontWeight: 300 }}>
              Type a question, or use <span className="kbd" style={{ pointerEvents: "all" }}>/</span> for commands like <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>/plan</span>, <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>/summarize</span>, or <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>/flashcards</span>.
            </p>
          </div>
        )}

        {/* Composer */}
        <div style={{
          position: "sticky", bottom: 0,
          padding: "16px 28px 24px",
          borderTop: "1px solid var(--border)",
          background: "rgba(10,10,12,0.85)",
          backdropFilter: "blur(8px)",
          zIndex: 40,
        }}>
          <div style={{ maxWidth: 820, margin: "0 auto", position: "relative" }}>
            {/* Slash commands popup */}
            {showSlash && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 10px)", left: 0, right: 0,
                background: "var(--surface-2)", border: "1px solid var(--border-strong)",
                padding: 6, boxShadow: "0 16px 48px -8px rgba(0,0,0,0.7)", zIndex: 10,
              }}>
                <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
                  <span className="sect-num">§ COMMANDS</span>
                  <span className="sect-num">↑↓ NAV · ↵ SELECT</span>
                </div>
                {slashCommands.map((s, i) => (
                  <div key={s.cmd}
                    onClick={() => { setInput(s.cmd + " "); setShowSlash(false); inputRef.current?.focus(); }}
                    style={{
                      padding: "9px 12px", display: "flex", alignItems: "center", gap: 12,
                      cursor: "pointer",
                      background: i === 0 ? "rgba(237,232,220,0.05)" : "transparent",
                      borderLeft: i === 0 ? "1.5px solid var(--cream)" : "1.5px solid transparent",
                      transition: "all .12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(237,232,220,0.05)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = i === 0 ? "rgba(237,232,220,0.05)" : "transparent"; }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "var(--cream)", fontFamily: "var(--font-mono)", fontWeight: 500, letterSpacing: "0.02em" }}>{s.cmd}</div>
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "var(--font-head)", fontStyle: "italic", marginTop: 2 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{
              background: "rgba(237,232,220,0.02)", border: "1px solid var(--border-strong)", padding: 4,
            }}>
              <textarea
                ref={inputRef}
                id="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Athena anything…"
                rows={1}
                disabled={loadingState === "loading"}
                style={{
                  width: "100%", background: "transparent", border: "none", outline: "none",
                  padding: "14px 14px 6px", fontSize: 14, color: "var(--text)", resize: "none",
                  minHeight: 48, fontFamily: "var(--font-head)", lineHeight: 1.5,
                  fontStyle: input ? "normal" : "italic",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px 6px" }}>
                <span className="sect-num" style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                  <span className="kbd">/</span> CMDS
                  <span style={{ margin: "0 3px" }}>·</span>
                  <span className="kbd">⇧</span><span className="kbd">↵</span> NL
                </span>
                <button
                  id="chat-send"
                  onClick={() => handleSend()}
                  disabled={loadingState === "loading" || !input.trim()}
                  style={{
                    width: 32, height: 32,
                    background: input.trim() ? "var(--cream)" : "rgba(237,232,220,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: input.trim() ? "#0a0a0c" : "var(--text-dim)",
                    transition: "all .15s", border: "none", cursor: "pointer",
                    opacity: loadingState === "loading" ? 0.5 : 1,
                  }}
                >
                  {loadingState === "loading" ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ChatBubble({ message, userInitial }: { message: ChatMessage; userInitial: string }) {
  const isUser = message.role === "user";
  const isTyping = !isUser && !message.content;

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }} className="animate-fade-in">
        <div style={{
          maxWidth: "72%", padding: "12px 16px",
          background: "var(--cream)", color: "#0a0a0c",
          fontSize: 14, lineHeight: 1.5, letterSpacing: "-0.005em",
        }}>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }} className="animate-fade-in">
      <div style={{
        width: 32, height: 32, flexShrink: 0,
        border: "1px solid var(--cream-ghost)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--cream)", fontSize: 17,
        fontFamily: "var(--font-head)", fontStyle: "italic",
        marginTop: 2,
      }}>A</div>
      <div style={{ flex: 1, minWidth: 0, maxWidth: "85%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 400, color: "var(--cream)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>Athena</span>
          {message.agent && <AgentBadge agent={message.agent} />}
          {isTyping && (
            <span className="sect-num" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cream)", animation: "athenaPulse 1.5s infinite" }} />
              THINKING
            </span>
          )}
        </div>
        <div style={{ color: "var(--cream)", fontSize: 14, lineHeight: 1.65, letterSpacing: "-0.005em", fontFamily: "var(--font-head)" }}>
          {isTyping ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {[0,1,2].map(i => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(237,232,220,0.5)", animation: `athenaPulse 1.2s infinite ${i * 0.15}s` }} />
              ))}
            </div>
          ) : (
            <div className="prose-chat" dangerouslySetInnerHTML={{ __html: renderWithLatex(message.content) }} />
          )}
        </div>
        {/* Action row */}
        {!isTyping && message.content && (
          <div style={{ display: "flex", gap: 0, marginTop: 10 }}>
            {["Copy", "Explain more", "Quiz me", "Save"].map((a, i) => (
              <button key={a} style={{
                fontSize: 10, color: "var(--text-muted)", padding: `4px ${i === 0 ? "10px 4px 0" : "10px"}`,
                border: "none", borderRight: i < 3 ? "1px solid var(--border)" : "none",
                fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase",
                transition: "color .15s", background: "none", cursor: "pointer",
              }}
                onClick={() => {
                  if (a === "Copy") navigator.clipboard.writeText(message.content);
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--cream)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >{a}</button>
            ))}
          </div>
        )}
        {message.flashcards && message.flashcards.length > 0 && (
          <FlashcardDeck flashcards={message.flashcards} />
        )}
      </div>
    </div>
  );
}
