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
  ReviewGrade,
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

/** Turn a FastAPI error body ({"detail": ...}) into a readable message. */
async function errorMessage(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const detail = JSON.parse(body)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  } catch { /* not JSON */ }
  return body || `Request failed (${res.status})`;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new ApiClientError(await errorMessage(res), res.status);
  }
  return res.json() as Promise<T>;
}

export interface ChatStreamDone {
  agent: string
  memory_updated: boolean
  fallback: boolean
  /** Final text of the reply. Replaces whatever was streamed. */
  content: string
  flashcards?: Flashcard[]
  quiz?: QuizQuestion[]
}

/** Read an SSE response of `token` events followed by one `done` event. */
async function readEventStream(
  res: Response,
  onToken: (token: string) => void,
  onDone: (meta: ChatStreamDone) => void,
  onError: (error: string) => void
): Promise<void> {
  if (!res.ok || !res.body) {
    throw new ApiClientError(res.ok ? "Stream failed" : await errorMessage(res), res.status)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let gotDone = false

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
          gotDone = true
          onDone({
            agent: parsed.agent,
            memory_updated: parsed.memory_updated,
            fallback: parsed.fallback,
            content: parsed.content ?? "",
            flashcards: parsed.flashcards ?? undefined,
            quiz: parsed.quiz ?? undefined,
          })
        }
      } catch {
        // skip malformed chunk
      }
    }
  }
  if (!gotDone) {
    onError("The connection closed before the reply finished. Please try again.")
  }
}

function streamFailure(err: unknown, onError: (error: string) => void): void {
  if (err instanceof ApiClientError) {
    onError(err.message)
  } else {
    onError("Cannot reach the backend. Is it running on " + BASE_URL + "?")
  }
}

export async function sendChatMessageStream(
  params: ChatRequest,
  token: string,
  onToken: (token: string) => void,
  onDone: (meta: ChatStreamDone) => void,
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
    await readEventStream(res, onToken, onDone, onError)
  } catch (err) {
    streamFailure(err, onError)
  }
}

/** Summarize a file, streaming the summary as it is written. The `done`
 * event's content is the final, citation-checked text. */
export async function summarizeFileStream(
  file: File,
  sessionId: string,
  token: string,
  onToken: (token: string) => void,
  onDone: (meta: ChatStreamDone) => void,
  onError: (error: string) => void
): Promise<void> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("session_id", sessionId)
  try {
    const res = await fetch(`${BASE_URL}/summarize/stream`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData,
    })
    await readEventStream(res, onToken, onDone, onError)
  } catch (err) {
    streamFailure(err, onError)
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
// multipart/form-data: the file plus session_id. The backend extracts the text.

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

// ─── Flashcards from a file (upload) ─────────────────────
// The backend reads the whole document and returns `count` cards spread
// across it, each with the page (or line range) it came from.

export async function flashcardsFromFile(
  file: File,
  count: number,
  sessionId: string,
  token: string
): Promise<UnifiedResponse> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("count", String(count))
  formData.append("session_id", sessionId)

  try {
    const res = await fetch(`${BASE_URL}/flashcards/document`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
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
      {
        role: string;
        content: string;
        agent?: string;
        flashcards?: Flashcard[] | null;
        quiz?: QuizQuestion[] | null;
      }[]
    >(res);
    return msgs.map((m) => ({
      id: crypto.randomUUID(),
      role: m.role as "user" | "assistant",
      content: m.content,
      agent: m.agent,
      flashcards: m.flashcards ?? undefined,
      quiz: m.quiz ?? undefined,
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
): Promise<boolean> {
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
    return true;
  } catch {
    // Non-critical — don't break UI if save fails
    console.error("Failed to save note");
    return false;
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

// ─── Quiz results ─────────────────────────────────────────
// Saves a finished quiz. Missed questions become a weak area that the
// dashboard shows and the Quiz agent targets next time.

export interface QuizResultPayload {
  /** The request that produced the quiz, e.g. "Quiz me on photosynthesis". */
  topic: string;
  score: number;
  total: number;
  missed: { question: string; correct_answer: string }[];
  session_id?: string | null;
}

export async function saveQuizResult(payload: QuizResultPayload, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/quiz/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Spaced repetition ────────────────────────────────────
// Grading a card puts it on (or moves it along) its SM-2 schedule.

export interface DueCards {
  cards: Flashcard[];
  due_count: number;
  total: number;
}

export async function gradeCard(
  card: Flashcard,
  grade: ReviewGrade,
  deck: string,
  token: string
): Promise<boolean> {
  const body = card.id != null
    ? { card_id: card.id, grade }
    : {
        grade,
        card: {
          question: card.question.slice(0, 2000),
          answer: card.answer.slice(0, 4000),
          source: card.source ?? null,
          deck: (deck || "Flashcards").slice(0, 200),
        },
      };
  try {
    const res = await fetch(`${BASE_URL}/reviews/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getDueCards(token: string, limit = 50): Promise<DueCards> {
  try {
    const res = await fetch(`${BASE_URL}/reviews/due?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<DueCards>(res);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Cannot reach backend");
  }
}

// ─── Dashboard stats ──────────────────────────────────────

export interface StudyStats {
  agent_counts: Record<"advisor" | "planner" | "summarizer" | "flashcard" | "quiz", number>;
  usage_days: number;
  streak_days: number;
  studied_today: boolean;
  recent_quizzes: { topic: string; score: number; total: number; created_at: string }[];
  reviews_due: number;
  review_cards: number;
}

export async function getStats(token: string): Promise<StudyStats> {
  try {
    const offset = new Date().getTimezoneOffset();
    const res = await fetch(`${BASE_URL}/stats?tz_offset_minutes=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<StudyStats>(res);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Cannot reach backend");
  }
}

// ─── Study plan from a syllabus ───────────────────────────

export async function planFromSyllabus(
  file: File,
  input: string,
  sessionId: string,
  token: string
): Promise<UnifiedResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("input", input);
  formData.append("session_id", sessionId);
  try {
    const res = await fetch(`${BASE_URL}/plan/syllabus`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    return handleResponse<UnifiedResponse>(res);
  } catch (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError("Cannot reach the backend. Is it running on " + BASE_URL + "?");
  }
}
