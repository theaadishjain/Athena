"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import DashboardLayout from "@/components/ui/DashboardLayout";
import AgentBadge from "@/components/ui/AgentBadge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ErrorBanner from "@/components/ui/ErrorBanner";
import FlashcardDeck from "@/components/chat/FlashcardDeck";
import QuizDeck, { type QuizOutcome } from "@/components/chat/QuizDeck";
import type { ChatMessage, Flashcard, LoadingState, ReviewGrade } from "@/lib/types";
import {
  sendChatMessageStream,
  createSession,
  getSessionMessages,
  saveNote,
  saveQuizResult,
  gradeCard,
} from "@/lib/api";
import { setCurrentSession, resetCurrentSession } from "@/lib/session";
import { renderWithLatex } from "@/lib/renderMarkdown";

export default function ChatPage() {
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
      <ChatPageContent />
    </Suspense>
  );
}

const SLASH_COMMANDS = [
  { cmd: "/plan", desc: "Generate a study plan for an upcoming exam" },
  { cmd: "/summarize", desc: "Summarize pasted text (upload files on Notes)" },
  { cmd: "/flashcards", desc: "Make flashcards you can review on a spaced-repetition schedule" },
  { cmd: "/quiz", desc: "Quiz me on topics I'm weak at" },
  { cmd: "/explain", desc: "Explain a concept step-by-step" },
  { cmd: "/solve", desc: "Work through a problem together" },
];

function ChatPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showSlash, setShowSlash] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const { getToken } = useAuth();

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
        setHistoryLoading(false);
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
          setHistoryLoading(true);
          try {
            const msgs = await getSessionMessages(targetId, token);
            if (!cancelled) setMessages(msgs);
          } catch {
            if (!cancelled) { resetCurrentSession(); setCurrentSessionId(null); }
          } finally {
            if (!cancelled) setHistoryLoading(false);
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

    // The backend saves both messages (including flashcards / quiz) itself.
    const assistantId = assistantMessage.id;
    const patchAssistant = (patch: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? patch(m) : m)));

    await sendChatMessageStream(
      { session_id: activeSessionId as string, input: trimmed },
      await getToken() as string,
      (token) => {
        patchAssistant((m) => ({ ...m, content: m.content + token }));
      },
      (meta) => {
        patchAssistant((m) => ({
          ...m,
          // Final text from the server: covers agents that don't stream
          // (flashcards, quiz) and replaces partial text on fallback.
          content: meta.content || m.content,
          agent: meta.agent,
          flashcards: meta.flashcards,
          quiz: meta.quiz,
        }));
        setLoadingState("success");
      },
      (errorMessage) => {
        // Drop the empty "thinking" bubble so it doesn't spin forever.
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
        setError(errorMessage);
        setLoadingState("error");
      }
    );
  }, [input, loadingState, currentSessionId, getToken]);

  const handleSaveAnswer = useCallback(async (message: ChatMessage, prompt: string): Promise<boolean> => {
    const token = await getToken();
    if (!token || !currentSessionId) return false;
    const title = prompt.trim() ? prompt.trim().slice(0, 60) : "Chat answer";
    return saveNote(currentSessionId, title, message.content, token);
  }, [getToken, currentSessionId]);

  const handleQuizComplete = useCallback(async (prompt: string, outcome: QuizOutcome): Promise<boolean> => {
    const token = await getToken();
    if (!token) return false;
    return saveQuizResult({ topic: prompt.trim() || "General", ...outcome, session_id: currentSessionId }, token);
  }, [getToken, currentSessionId]);

  const handleCardGrade = useCallback(async (prompt: string, card: Flashcard, grade: ReviewGrade): Promise<boolean> => {
    const token = await getToken();
    return token ? gradeCard(card, grade, prompt.trim().slice(0, 80) || "Chat flashcards", token) : false;
  }, [getToken]);

  const handleSendRef = useRef(handleSend);
  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const canSend = loadingState !== "loading" && !!input.trim();

  return (
    <DashboardLayout>
      <div className="relative flex h-screen flex-col">

        {/* Chat Header */}
        <header className="topbar">
          <div className="flex items-center gap-3.5">
            <span className="label">§ Session</span>
            <h2 className="serif-i text-[19px]">
              {messages.length > 0 ? "Conversation" : "New chat"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="label mr-1">{messages.length} messages</span>
            {messages.length > 0 && (
              <button id="export-chat-btn" onClick={exportChatAsMarkdown} className="btn btn-subtle btn-sm">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export
              </button>
            )}
            <button id="new-chat-btn" onClick={handleNewChat} className="btn btn-subtle btn-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-7 pt-7 pb-[120px]">
          <div className="mx-auto flex max-w-[820px] flex-col gap-6">

            {historyLoading && messages.length === 0 && <HistorySkeleton />}

            {messages.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-line" />
                <span className="label">Today</span>
                <div className="h-px flex-1 bg-line" />
              </div>
            )}

            {messages.map((msg, i) => {
              // The user message this reply answers, for "Quiz me" / "Save".
              const prompt = messages.slice(0, i).reverse().find((m) => m.role === "user")?.content ?? "";
              return (
                <ChatBubble key={msg.id} message={msg} prompt={prompt}
                  busy={loadingState === "loading"}
                  onExplainMore={() => handleSend("Explain that in more detail, with an example.")}
                  onQuizMe={() => handleSend(`Quiz me on: ${prompt.slice(0, 200)}`)}
                  onSave={() => handleSaveAnswer(msg, prompt)}
                  onQuizComplete={(outcome) => handleQuizComplete(prompt, outcome)}
                  onCardGrade={(card, grade) => handleCardGrade(prompt, card, grade)}
                />
              );
            })}

            {error && <ErrorBanner message={error} onRetry={() => setError(null)} />}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Welcome state */}
        {messages.length === 0 && loadingState !== "loading" && !historyLoading && (
          <div className="pointer-events-none absolute top-1/2 left-1/2 w-full max-w-[560px] -translate-x-1/2 -translate-y-1/2 px-7 text-center">
            <div className="glow-radial" style={{
              width: 600, height: 600, top: -200, left: "50%", transform: "translateX(-50%)",
              background: "radial-gradient(circle, rgba(237,232,220,0.04), transparent 70%)",
            }} />
            <h1 className="h-lg mb-4 text-[60px] leading-[0.98]">
              What are<br />
              <em className="serif-i">we studying</em><br />
              today?
            </h1>
            <p className="text-body">
              Type a question, or use <span className="kbd pointer-events-auto">/</span> for commands like{" "}
              <code className="font-mono text-[12.5px]">/plan</code>, <code className="font-mono text-[12.5px]">/summarize</code>, or{" "}
              <code className="font-mono text-[12.5px]">/flashcards</code>.
            </p>
          </div>
        )}

        {/* Composer */}
        <div className="composer">
          <div className="relative mx-auto max-w-[820px]">
            {/* Slash commands popup */}
            {showSlash && (
              <div className="menu absolute right-0 bottom-[calc(100%+10px)] left-0 z-10">
                <div className="flex justify-between border-b border-line px-3 py-2">
                  <span className="label">§ Commands</span>
                  <span className="label">↑↓ nav · ↵ select</span>
                </div>
                {SLASH_COMMANDS.map((s, i) => (
                  <div key={s.cmd}
                    onClick={() => { setInput(s.cmd + " "); setShowSlash(false); inputRef.current?.focus(); }}
                    className={`menu-item ${i === 0 ? "is-active" : ""}`}
                  >
                    <div className="font-mono text-[13px] font-medium text-cream">{s.cmd}</div>
                    <div className="text-meta mt-0.5">{s.desc}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="composer-box">
              <textarea
                ref={inputRef}
                id="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Athena anything…"
                rows={1}
                disabled={loadingState === "loading"}
                className="composer-input"
              />
              <div className="flex items-center gap-1 px-1.5 pt-1 pb-1.5">
                <span className="label ml-auto flex items-center gap-1">
                  <span className="kbd">/</span> commands
                  <span className="mx-1">·</span>
                  <span className="kbd">⇧</span><span className="kbd">↵</span> new line
                </span>
                <button
                  id="chat-send"
                  onClick={() => handleSend()}
                  disabled={!canSend}
                  aria-label="Send message"
                  className={`send-btn ml-2 ${input.trim() ? "is-ready" : ""} ${loadingState === "loading" ? "opacity-50" : ""}`}
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

/** Placeholder bubbles while an existing chat's messages load. */
function HistorySkeleton() {
  return (
    <div role="status" aria-label="Loading conversation" className="flex flex-col gap-6">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-6">
          <div className="flex justify-end">
            <span className="skeleton" style={{ width: i ? "34%" : "46%", height: 44 }} />
          </div>
          <div className="flex items-start gap-3.5">
            <span className="skeleton shrink-0" style={{ width: 32, height: 32 }} />
            <div className="flex flex-1 flex-col gap-2.5 pt-1">
              <span className="skeleton" style={{ width: 120, height: 12 }} />
              <span className="skeleton" style={{ width: "92%", height: 12 }} />
              <span className="skeleton" style={{ width: "84%", height: 12 }} />
              <span className="skeleton" style={{ width: "60%", height: 12 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ChatBubbleProps {
  message: ChatMessage;
  prompt: string;
  busy: boolean;
  onExplainMore: () => void;
  onQuizMe: () => void;
  onSave: () => Promise<boolean>;
  onQuizComplete: (outcome: QuizOutcome) => Promise<boolean>;
  onCardGrade: (card: Flashcard, grade: ReviewGrade) => Promise<boolean>;
}

type ActionLabel = "Copy" | "Explain more" | "Quiz me" | "Save";

function ChatBubble({ message, prompt, busy, onExplainMore, onQuizMe, onSave, onQuizComplete, onCardGrade }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isTyping = !isUser && !message.content;
  const [flash, setFlash] = useState<{ action: ActionLabel; text: string } | null>(null);

  const showFlash = (action: ActionLabel, text: string) => {
    setFlash({ action, text });
    setTimeout(() => setFlash(null), 1500);
  };

  const actions: ActionLabel[] = ["Copy", "Explain more", "Quiz me", "Save"];
  const runAction = async (action: ActionLabel) => {
    switch (action) {
      case "Copy":
        navigator.clipboard.writeText(message.content)
          .then(() => showFlash(action, "Copied"))
          .catch(() => showFlash(action, "Copy failed"));
        break;
      case "Explain more":
        onExplainMore();
        break;
      case "Quiz me":
        onQuizMe();
        break;
      case "Save":
        showFlash(action, (await onSave()) ? "Saved to notes" : "Save failed");
        break;
    }
  };
  // Follow-ups make no sense for a reply that has no question before it.
  const isDisabled = (action: ActionLabel) =>
    action !== "Copy" && (busy || (action !== "Save" && !prompt));

  if (isUser) {
    return (
      <div className="animate-fade-in flex justify-end">
        <div className="bubble-user">{message.content}</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex items-start gap-3.5">
      <div className="avatar mt-0.5">A</div>
      <div className="min-w-0 max-w-[85%] flex-1">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="serif-i text-[15px]">Athena</span>
          {message.agent && <AgentBadge agent={message.agent} />}
          {isTyping && (
            <span className="label inline-flex items-center gap-1.5">
              <span className="pulse-dot h-[5px] w-[5px]" />
              Thinking
            </span>
          )}
        </div>
        {isTyping ? (
          <div className="flex items-center gap-1">
            {[0, 1, 2].map(i => (
              <span key={i} className="h-1 w-1 rounded-full" style={{ background: "rgba(237,232,220,0.5)", animation: `athenaPulse 1.2s infinite ${i * 0.15}s` }} />
            ))}
          </div>
        ) : (
          <div className="prose-chat" dangerouslySetInnerHTML={{ __html: renderWithLatex(message.content) }} />
        )}
        {/* Action row */}
        {!isTyping && message.content && (
          <div className="mt-2.5 flex">
            {actions.map((a) => (
              <button key={a} type="button" disabled={isDisabled(a)} className="action-link" onClick={() => runAction(a)}>
                {flash?.action === a ? flash.text : a}
              </button>
            ))}
          </div>
        )}
        {message.flashcards && message.flashcards.length > 0 && (
          <FlashcardDeck flashcards={message.flashcards} onGrade={onCardGrade} />
        )}
        {message.quiz && message.quiz.length > 0 && (
          <div className="mt-3">
            <QuizDeck quiz={message.quiz} onComplete={onQuizComplete} />
          </div>
        )}
      </div>
    </div>
  );
}
