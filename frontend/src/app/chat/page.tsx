"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
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
  const [chatKey, setChatKey] = useState(0);

  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="flex min-h-screen items-center justify-center">
            <LoadingSpinner size="lg" label="Loading chat…" />
          </div>
        </DashboardLayout>
      }
    >
      <ChatPageContent key={chatKey} onNewChat={() => setChatKey(prev => prev + 1)} />
    </Suspense>
  );
}

function ChatPageContent({ onNewChat }: { onNewChat: () => void }) {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasHandledQuery = useRef(false);
  const session = useSession();
  const { getToken } = useAuth();

  // ── On mount: create/load session ───────────────────────
  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      try {
        const token = await getToken();
        if (!token) return;

        // Read canonical session key only
        const existingId = sessionStorage.getItem("athena_current_session");

        if (existingId) {
          setCurrentSessionId(existingId);
          try {
            const msgs = await getSessionMessages(existingId, token);
            if (!cancelled) setMessages(msgs);
          } catch {
            // Session expired or deleted — start fresh
            if (!cancelled) setCurrentSessionId(null);
          }
        } else {
          // No session yet — lazy creation on first message
          if (!cancelled) setCurrentSessionId(null);
        }

        // Check for pending query from dashboard handoff
        if (!cancelled) {
          const pending = sessionStorage.getItem("athena_pending_query");
          if (pending) {
            sessionStorage.removeItem("athena_pending_query");
            // Small delay so the component is fully mounted
            setTimeout(() => handleSend(pending), 50);
          }
        }
      } catch {
        if (!cancelled) setError("Connection failed");
      }
    }

    initSession();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── New Chat ─────────────────────────────────────────────
  const handleNewChat = useCallback(async () => {
    resetCurrentSession();
    onNewChat();
  }, [onNewChat]);

  // ── Send message ─────────────────────────────────────────
  const handleSend = useCallback(async (overrideInput?: string) => {
    const trimmed = (overrideInput ?? input).trim();
    if (!trimmed || loadingState === "loading") return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    // Add empty assistant message immediately
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setLoadingState("loading");
    setError(null);

    let finalContent = "";
    let finalAgent = "";
    let activeSessionId = currentSessionId;

    // Create session if it doesn't exist (Bug 2 fix)
    if (!activeSessionId) {
      try {
        const token = await getToken();
        if (!token) throw new Error("Auth failed");
        const newSession = await createSession(token);
        activeSessionId = newSession.id;
        setCurrentSession(newSession.id);
        setCurrentSessionId(newSession.id);
      } catch (err) {
        setError("Could not initialize session");
        setLoadingState("idle");
        return;
      }
    }

    await sendChatMessageStream(
      {
        user_id: session.user_id,
        session_id: activeSessionId as string,
        input: trimmed,
      },
      (token) => {
        finalContent += token;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + token,
          };
          return updated;
        });
      },
      (meta) => {
        finalAgent = meta.agent;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            agent: meta.agent,
            flashcards: meta.flashcards,
          };
          return updated;
        });
        setLoadingState("success");

        // Fire-and-forget: persist messages to backend
        getToken().then((tok) => {
          if (!tok || !activeSessionId) return;
          saveMessage(activeSessionId, { role: "user", content: trimmed }, tok)
            .catch(() => {});
          saveMessage(
            activeSessionId,
            { role: "assistant", content: finalContent, agent: finalAgent },
            tok
          ).catch(() => {});
        });
      },
      (errorMessage) => {
        setError(errorMessage);
        setLoadingState("error");
      }
    );
  }, [input, loadingState, session, currentSessionId, getToken]);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !hasHandledQuery.current) {
      hasHandledQuery.current = true;
      setTimeout(() => {
        handleSend(q);
      }, 0);
    }
  }, [searchParams, handleSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col h-screen">
        {/* Header with New Chat button */}
        <div
          className="fixed top-0 right-0 z-30 flex items-center justify-end px-6 py-3"
          style={{ left: "240px" }}
        >
          <button
            id="new-chat-btn"
            onClick={handleNewChat}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted hover:text-foreground hover:bg-white/[0.04] transition-all border border-transparent hover:border-border"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto pb-32 px-6 pt-14">
          <div className="mx-auto max-w-2xl space-y-5">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}

            {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Welcome Message — shows only when empty */}
        {messages.length === 0 && loadingState !== "loading" && (
          <div className="mx-auto max-w-2xl w-full px-6 mb-24">
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="surface-card rounded-xl px-6 py-5 max-w-[90%]">
                <h1 className="text-[15px] font-medium text-foreground mb-2">
                  Hi! I'm Athena, your AI study assistant.
                </h1>
                <p className="text-sm text-muted leading-relaxed mb-3">
                  Here's what I can help you with:
                </p>
                <ul className="text-sm text-muted space-y-2.5 list-disc pl-5">
                  <li>Create a study plan for your upcoming exams</li>
                  <li>Summarize your lecture notes or PDFs</li>
                  <li>Explain any concept in detail with examples</li>
                  <li>Generate flashcards to memorize key topics</li>
                  <li>Quiz you on any subject with instant feedback</li>
                </ul>
                <p className="text-[12px] text-muted/60 mt-5 italic">
                  Upload a file with the notes button, or just start typing.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <div
          className="fixed bottom-0 right-0 z-40 border-t border-border bg-background/80 backdrop-blur-xl"
          style={{ left: "220px" }}
        >
          <div className="mx-auto max-w-2xl px-6 py-3">
            <div className="surface-card rounded-xl p-1 flex items-end gap-2">
              <textarea
                ref={inputRef}
                id="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                rows={1}
                disabled={loadingState === "loading"}
                className="flex-1 resize-none bg-transparent px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted/40 focus:outline-none disabled:opacity-50 max-h-28 overflow-y-auto"
                style={{ minHeight: "40px" }}
              />
              <button
                id="chat-send"
                onClick={() => handleSend()}
                disabled={loadingState === "loading" || !input.trim()}
                className="shrink-0 rounded-lg bg-primary p-2.5 text-white transition-all hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loadingState === "loading" ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.27 3.126A59.768 59.768 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isTyping = !isUser && !message.content;

  return (
    <div className={`flex items-start gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold ${
          isUser
            ? "bg-white/[0.06] text-muted"
            : "bg-primary/8 text-primary"
        }`}
      >
        {isUser ? "U" : "AI"}
      </div>

      <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {!isUser && message.agent && <AgentBadge agent={message.agent} />}
        <div
          className={`rounded-xl px-4 py-3 ${
            isUser
              ? "bg-white/[0.06] border border-white/[0.06]"
              : "surface-card"
          }`}
        >
          {isTyping ? (
            <div className="flex items-center gap-1.5 h-5">
              <span className="h-1.5 w-1.5 rounded-full bg-muted/60 animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted/60 animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted/60 animate-bounce [animation-delay:300ms]" />
            </div>
          ) : isUser ? (
            <p className="text-[13px] leading-[1.7] whitespace-pre-wrap text-foreground/85">
              {message.content}
            </p>
          ) : (
            <div
              className="prose-chat prose-invert"
              dangerouslySetInnerHTML={{
                __html: renderWithLatex(message.content),
              }}
            />
          )}
        </div>
        {message.flashcards && message.flashcards.length > 0 && (
          <FlashcardDeck flashcards={message.flashcards} />
        )}
      </div>
    </div>
  );
}
