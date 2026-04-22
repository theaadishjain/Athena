// ─── API Response Types ───────────────────────────────────

export interface Flashcard {
  question: string;
  answer: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

export interface UnifiedResponse {
  status: "success" | "error";
  agent: "planner" | "summarizer" | "advisor" | "coordinator" | "flashcard" | "quiz";
  response: string;
  memory_updated: boolean;
  fallback: boolean;
  flashcards?: Flashcard[];
}

export interface MemoryEntry {
  memory_type: string;
  content: string;
}

// ─── Chat Types ───────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: string;
  flashcards?: Flashcard[];
}

// ─── API Request Parameter Types ──────────────────────────

export interface ChatRequest {
  session_id: string;
  input: string;
}

export interface PlanRequest {
  session_id: string;
  input: string;
}

export interface MemoryQuery {
  user_id: string;
  memory_type?: string;
  k?: number;
  query?: string;
}

// ─── UI State Types ───────────────────────────────────────

export type LoadingState = "idle" | "loading" | "success" | "error";

export interface ApiError {
  message: string;
  status?: number;
}

// ─── Session Types ────────────────────────────────────────

export interface ChatSessionMeta {
  id: string;
  title: string;
  created_at: string;
}
