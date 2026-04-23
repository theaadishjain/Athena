import type {
  UnifiedResponse,
  MemoryEntry,
  ChatRequest,
  PlanRequest,
  MemoryQuery,
  Flashcard,
  QuizQuestion,
  ChatMessage,
  ChatSessionMeta,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────

export class ApiClientError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new ApiClientError(body, res.status);
  }
  return res.json() as Promise<T>;
}

export async function sendChatMessageStream(
  params: ChatRequest,
  token: string,
  onToken: (token: string) => void,
  onDone: (meta: {
    agent: string
    memory_updated: boolean
    fallback: boolean
    flashcards?: Flashcard[]
    quiz?: QuizQuestion[]
  }) => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    })

    if (!res.ok || !res.body) {
      throw new ApiClientError("Stream failed", res.status)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const raw = line.slice(6).trim()
        if (!raw) continue

        try {
          const parsed = JSON.parse(raw)
          if (parsed.type === "token") {
            onToken(parsed.content)
          } else if (parsed.type === "done") {
            onDone({
              agent: parsed.agent,
              memory_updated: parsed.memory_updated,
              fallback: parsed.fallback,
              flashcards: parsed.flashcards ?? undefined,
              quiz: parsed.quiz ?? undefined,
            })
          }
        } catch {
          // skip malformed chunk
        }
      }
    }
  } catch (err) {
    if (err instanceof ApiClientError) {
      onError(err.message)
    } else {
      onError("Cannot reach the backend. Is it running on " + BASE_URL + "?")
    }
  }
}

// ─── Study Plan ───────────────────────────────────────────

export async function getStudyPlan(
  params: PlanRequest,
  token: string
): Promise<UnifiedResponse> {
  try {
    const res = await fetch(`${BASE_URL}/plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });
    return handleResponse<UnifiedResponse>(res);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError(
      "Cannot reach the backend. Is it running on " + BASE_URL + "?"
    );
  }
}

// ─── Summarize (file upload) ──────────────────────────────
// Backend expects JSON { user_id, session_id, input } where input
// is the extracted text content of the file — not multipart/form-data.

export async function summarizeFile(
  file: File,
  sessionId: string,
  token: string
): Promise<UnifiedResponse> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("session_id", sessionId)

  try {
    const res = await fetch(`${BASE_URL}/summarize`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      body: formData,
    })
    return handleResponse<UnifiedResponse>(res)
  } catch (err) {
    if (err instanceof ApiClientError) throw err
    throw new ApiClientError(
      "Cannot reach the backend. Is it running on " + BASE_URL + "?"
    )
  }
}

// ─── Memory ──────────────────────────────────────────────
// Backend returns { user_id, memory_type, memories: string[] }
// We transform this to MemoryEntry[] for the frontend.

interface MemoryReadResponse {
  user_id: string;
  memory_type: string;
  memories: string[];
}

export async function getMemories(
  params: MemoryQuery,
  token: string
): Promise<MemoryEntry[]> {
  const memoryType = params.memory_type || "general";
  const url = new URL(`${BASE_URL}/memory`);
  url.searchParams.set("memory_type", memoryType);
  if (params.k !== undefined) url.searchParams.set("k", String(params.k));
  if (params.query) url.searchParams.set("query", params.query);

  try {
    const res = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const data = await handleResponse<MemoryReadResponse>(res);
    return data.memories.map((content) => ({
      memory_type: data.memory_type,
      content,
    }));
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError(
      "Cannot reach the backend. Is it running on " + BASE_URL + "?"
    );
  }
}

// ─── Sessions ─────────────────────────────────────────────

export async function listSessions(
  token: string
): Promise<ChatSessionMeta[]> {
  try {
    const res = await fetch(`${BASE_URL}/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<ChatSessionMeta[]>(res);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Cannot reach backend");
  }
}

export async function createSession(
  token: string
): Promise<{ id: string; title: string }> {
  try {
    const res = await fetch(`${BASE_URL}/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<{ id: string; title: string }>(res);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Cannot reach backend");
  }
}

export async function getSessionMessages(
  sessionId: string,
  token: string
): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msgs = await handleResponse<
      { role: string; content: string; agent?: string }[]
    >(res);
    return msgs.map((m) => ({
      id: crypto.randomUUID(),
      role: m.role as "user" | "assistant",
      content: m.content,
      agent: m.agent,
    }));
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Cannot reach backend");
  }
}

export async function saveMessage(
  sessionId: string,
  message: { role: string; content: string; agent?: string },
  token: string
): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
    await handleResponse(res);
  } catch {
    // Non-critical — don't break chat if save fails
    console.error("Failed to save message");
  }
}

export async function deleteSession(
  sessionId: string,
  token: string
): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await handleResponse(res);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Cannot reach backend");
  }
}

export async function saveNote(
  sessionId: string,
  filename: string,
  summary: string,
  token: string
): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/notes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filename, summary }),
    });
    await handleResponse(res);
  } catch {
    // Non-critical — don't break UI if save fails
    console.error("Failed to save note");
  }
}

// ─── Memory Profile ───────────────────────────────────────

export async function getMemoryProfile(token: string): Promise<{
  preferences: string[];
  weak_subjects: string[];
  recent_topics: string[];
}> {
  try {
    const res = await fetch(`${BASE_URL}/memory/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse(res);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Cannot reach backend");
  }
}

// ─── Past Summaries ───────────────────────────────────────

export interface PastSummary {
  id: number;
  filename: string;
  summary: string;
  created_at: string;
}

export async function getAllNotes(token: string): Promise<PastSummary[]> {
  try {
    const res = await fetch(`${BASE_URL}/sessions/notes/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<PastSummary[]>(res);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Cannot reach backend");
  }
}
