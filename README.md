# Athena — AI-Powered Academic Assistant

> *Your quiet study partner. One conversation. Six specialists.*

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-multi--agent-orange?style=flat-square)](https://langchain-ai.github.io/langgraph)
[![Clerk](https://img.shields.io/badge/Clerk-auth-purple?style=flat-square)](https://clerk.com)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

---

## What is Athena?

Athena is a **stateful, multi-agent AI academic assistant** that replaces 4–5 disconnected study tools with a single platform that gets smarter about you over time.

Unlike ChatGPT and similar tools, Athena **remembers you permanently** using vector memory, **automatically routes** your academic tasks to the right specialist agent, and delivers **interactive study tools** — not just text.

```
"I have a data structures exam in 3 days"  →  Planner generates a 3-day schedule
"explain binary trees"                     →  Advisor explains with code examples
"create 20 flashcards on binary trees"     →  Flashcard agent returns 20 Q&A pairs
"summarize this lecture PDF"               →  Summarizer returns structured notes
"quiz me on photosynthesis"                →  Quiz agent generates 5 MCQs with scoring
```

---

## Key Differentiators

| | ChatGPT | Athena |
|---|---|---|
| Memory | Forgets after session | Permanent vector memory |
| Agents | One model, everything | 6 specialist agents |
| Routing | Manual — user decides | Automatic intent detection |
| Active learning | Text only | Flip cards + scored quiz |
| History | Browser only | Cross-device via Clerk |
| Documents | Basic file reading | Summarize + save to memory |
| Study plan | Generic text | Session-based + saved |

---

## Features

- **6 Specialist Agents** via LangGraph — Coordinator, Advisor, Planner, Summarizer, Flashcard, Quiz
- **Persistent Vector Memory** — MemPalace + ChromaDB, namespaced by Clerk userId
- **Real-time SSE Streaming** — tokens are streamed from the model as they are generated
- **Interactive Flashcards** — 10 / 20 / 30 flip cards from any topic, or from a whole uploaded file (cards spread across every part, each citing its page); one click from a Notes summary too
- **MCQ Quiz** — 5 questions with instant feedback and final score; scores are saved, missed questions become weak areas, and the next quiz targets them
- **Document Intelligence** — PDF, TXT, MD upload → the whole document is read (long files are noted in parallel parts, then merged) into a structured summary with page / line citations and a revision checklist
- **Study Plan Generator** — session-based day-by-day exam preparation
- **Conversation context** — the last few messages of a chat are sent with each request, so follow-ups like "explain more" work
- **Cross-device Session History** — all chats (including flashcards and quizzes), notes, and plans sync via Clerk auth
- **Memory Profile** — dashboard shows what Athena knows about your study habits
- **Export** — download chat as Markdown, summaries as PDF or Markdown
- **Markdown + KaTeX + Syntax Highlighting** — full academic content rendering
- **JWT Security** — every route protected, user identity from token only

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND  │  Chat │ Notes │ Flashcards │ Study Plan │ Dashboard │ Clerk Auth  │
└──────────────────────────┬──────────────────────────────────┘
                           │  SSE / REST + Bearer JWT
┌──────────────────────────▼──────────────────────────────────┐
│  API       │  FastAPI  /chat /plan /summarize /sessions /memory  │
└──────────────────────────┬──────────────────────────────────┘
                           │  AcademicState
┌──────────────────────────▼──────────────────────────────────┐
│  AGENTS    │              LangGraph                          │
│            │         Coordinator Router                      │
│            │    ↙      ↙      ↓      ↘      ↘              │
│            │ Advisor Planner Summarizer Flashcard Quiz       │
│            │              Agent Executor                     │
│            │              OpenRouter (gemini-2.5-flash)      │
└──────────────────────────┬──────────────────────────────────┘
            read ↕ write   │  session save
┌──────────────────────────▼──────────────────────────────────┐
│  PERSIST   │  MemPalace+ChromaDB  │  SQLite (aiosqlite)     │
│            │  past_chats          │  sessions               │
│            │  preferences         │  messages               │
│            │  weak_subjects       │  session_notes          │
│            │  note_summaries      │  (cross-device)         │
└─────────────────────────────────────────────────────────────┘
```

**Memory flow (all agents, every request):**
```
read top-k → inject into AcademicState → agent generates → write to ChromaDB
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Auth | Clerk (RS256 JWT verified with PyJWT, permanent userId, cross-device) |
| Backend | Python 3.11, FastAPI, LangGraph |
| LLM | OpenRouter → google/gemini-2.5-flash |
| Memory | MemPalace + ChromaDB (vector DB) |
| Database | SQLite via SQLAlchemy async (aiosqlite) |
| Rendering | marked.js + KaTeX + highlight.js, sanitized with DOMPurify |
| Deploy | Docker, Vercel (frontend), Railway (backend) |

---

## Project Structure

```
Athena/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── coordinator/    # Router + workflow
│   │   │   ├── advisor/        # Guidance agent
│   │   │   ├── planner/        # Study schedule agent
│   │   │   ├── summarizer/     # Document agent
│   │   │   ├── flashcard/      # Q&A generation agent
│   │   │   ├── quiz/           # MCQ generation agent
│   │   │   └── shared/         # AcademicState, executor, prompts
│   │   ├── api/                # FastAPI routes
│   │   ├── core/               # Config, auth, database, dependencies
│   │   ├── memory/             # MemPalace adapter, provider, retrieval
│   │   ├── schemas/            # Request/response DTOs
│   │   └── services/           # LLM service, ingest
│   ├── tests/              # pytest suite (fake LLM, no API key needed)
│   ├── Dockerfile
│   ├── requirements.txt    # pinned runtime deps
│   ├── requirements-dev.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js pages
│   │   │   ├── page.tsx        # Landing
│   │   │   ├── chat/           # Chat with streaming
│   │   │   ├── notes/          # Upload + summarize
│   │   │   ├── flashcards/     # Flashcard generator
│   │   │   ├── studyplan/      # Study plan generator
│   │   │   └── dashboard/      # Memory profile + overview
│   │   ├── components/
│   │   │   ├── chat/           # FlashcardDeck, QuizDeck
│   │   │   └── ui/             # Sidebar, AgentBadge, etc.
│   │   └── lib/
│   │       ├── api.ts          # All backend calls
│   │       ├── types.ts        # TypeScript interfaces
│   │       ├── session.ts      # Clerk session management
│   │       └── renderMarkdown.ts # marked + KaTeX + highlight.js
│   ├── Dockerfile
│   └── .env.local.example
└── docker-compose.yml
```

---

## Quick Start (Docker)

**Prerequisites:** Docker + Docker Compose installed

### 1. Clone the repository

```bash
git clone https://github.com/theaadishjain/athena.git
cd athena
```

### 2. Set up environment variables

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.local.example frontend/.env.local
```

Fill in your keys (see [Environment Variables](#environment-variables) below).

### 3. Run

`NEXT_PUBLIC_*` values are baked into the frontend at build time, so the Clerk
publishable key is passed as a build arg. Put it in a `.env` file next to
`docker-compose.yml` (Compose reads it automatically):

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
# Optional: where the *browser* reaches the backend (default http://localhost:8000)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
docker compose up --build
```

### 4. Open

```
http://localhost:3000
```

---

## Manual Setup (without Docker)

### Backend

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
# --reload-dir keeps the reloader from restarting when venv/ changes
uvicorn app.main:app --reload --reload-dir app --port 8000
```

Run the tests (no API keys needed; the LLM is faked):

```bash
pip install -r requirements-dev.txt
python -m pytest tests
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

> **No Clerk account yet?** Leave the Clerk keys empty. Clerk runs in *keyless*
> mode and writes temporary dev keys to `frontend/.clerk/.tmp/keyless.json`.
> Copy its `secretKey` into `backend/.env` as `CLERK_SECRET_KEY` so the backend
> accepts the same tokens. If the frontend starts on a port other than 3000,
> add that origin to `CORS_ORIGINS`.

---

## Environment Variables

### Backend (`backend/.env`)

```env
OPENROUTER_API_KEY=sk-or-...
LLM_MODEL=google/gemini-2.5-flash
CLERK_SECRET_KEY=sk_test_...
MEMPALACE_PATH=~/.mempalace/palace
MEMPALACE_COLLECTION=studyco
MEMORY_TOP_K=3
CORS_ORIGINS=http://localhost:3000
DATABASE_URL=sqlite+aiosqlite:///./studyco.db
APP_URL=http://localhost:3000

# Optional
CLERK_ISSUER=https://your-app.clerk.accounts.dev   # enforce token issuer
CLERK_AUTHORIZED_PARTIES=                          # allowed `azp`; defaults to CORS_ORIGINS
MAX_UPLOAD_MB=10                                   # /summarize upload limit
CHAT_HISTORY_MESSAGES=10                           # earlier messages sent to the model
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

### Where to get keys

| Key | Source |
|---|---|
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) — free account |
| `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` | [clerk.com/dashboard](https://clerk.com/dashboard) — free account |

---

## Agent System

All requests route through a single `/chat` endpoint. The Coordinator detects intent and routes automatically. Slash commands always win; otherwise only the start of the message is matched, so pasted notes don't change the route.

| Agent | Trigger keywords | Output |
|---|---|---|
| **Advisor** | explain, what/why/how questions, `/explain`, `/solve` (default) | Streaming text (brief/detailed auto-mode) |
| **Planner** | plan, schedule, timetable, deadline, exam + a time frame ("in 3 days", "next week"), `/plan` | Day-by-day study schedule |
| **Summarizer** | /notes page + file upload | Structured summary with `[p. N]` citations + checklist |
| **Flashcard** | flashcard(s), make cards, memorize, `/flashcards`; Flashcards page / Notes with a file | 10/20/30 Q&A flip cards (with `p. N` sources from files) |
| **Quiz** | quiz, quiz me, test me, mcq, practice questions, `/quiz` | 5 MCQ with scoring, aimed at your weak areas |

### Memory write ownership (strictly enforced)

| Agent | Writes to |
|---|---|
| Advisor | `past_chats`, `preferences` |
| Planner | `past_chats`, `preferences` |
| Summarizer | `note_summaries`, `weak_subjects` |
| Flashcard | `past_chats` |
| Quiz | `past_chats` (finished quizzes: `POST /quiz/results` writes missed questions to `weak_subjects`) |

---

## API Routes

All routes except `/health` require `Authorization: Bearer <clerk_jwt>` header.

```
GET  /health                        → { status: "ok" }
POST /chat                          → SSE stream: `token` events, then one `done` event
                                      (saves both messages; `persist: false` for one-off calls)
POST /plan                          → UnifiedResponse JSON
POST /summarize                     → multipart/form-data
POST /flashcards/document           → multipart/form-data (file, count) → UnifiedResponse with flashcards from the whole file
POST /extract                       → multipart/form-data → { filename, text } (plain-text preview, first 8,000 chars)
POST /quiz/results                  → save a finished quiz { topic, score, total, missed[] }; misses → weak area
GET  /quiz/results                  → recent quiz attempts
GET  /memory/profile                → { preferences, weak_subjects, recent_topics }
GET  /sessions                      → list user sessions
POST /sessions                      → create session
GET  /sessions/{id}/messages        → load chat history
POST /sessions/{id}/messages        → save message
GET  /sessions/notes/all            → past summaries + study plans
DELETE /sessions/{id}               → delete session and its messages (notes are kept)
DELETE /sessions/empty              → cleanup empty sessions
```

### UnifiedResponse schema

```typescript
{
  status: "success" | "error"
  agent: "planner" | "summarizer" | "advisor" | "coordinator" | "flashcard" | "quiz"
  response: string
  memory_updated: boolean
  fallback: boolean
  flashcards?: { question: string; answer: string }[]
  quiz?: { question: string; options: string[]; correct: string; explanation: string }[]
}
```

---

## Deployment

### Frontend → Vercel

1. Connect GitHub repo to [vercel.com](https://vercel.com)
2. Set root directory to `frontend/`
3. Add environment variables from `frontend/.env.local`
4. Update `NEXT_PUBLIC_API_URL` to your Railway backend URL
5. Deploy

### Backend → Railway

1. Connect GitHub repo to [railway.app](https://railway.app)
2. Set root directory to `backend/`
3. Railway auto-detects `backend/Dockerfile`
4. Add environment variables from `backend/.env`
5. Add persistent volume mounted at `/data`
6. Update env vars:
   ```
   MEMPALACE_PATH=/data/mempalace/palace
   DATABASE_URL=sqlite+aiosqlite:////data/studyco.db
   CORS_ORIGINS=https://your-vercel-domain.vercel.app
   APP_URL=https://your-railway-domain.up.railway.app
   ```
7. Switch Clerk keys from `pk_test_` / `sk_test_` to `pk_live_` / `sk_live_`

---

## Screenshots

| Page | Description |
|---|---|
| Landing | Premium dark academic UI, streaming hero |
| Dashboard | Memory profile, recent activity, agent overview |
| Chat | GPT-style streaming with agent badges |
| Notes | Drag-drop upload, summary, past summaries |
| Flashcards | 10/20/30 interactive flip cards |
| Study Plan | Session-based exam schedule generator |

---

## Future Roadmap

- [ ] RAG over PDFs — query specific textbook sections
- [ ] Voice transcription (Whisper) — lecture recording → notes
- [ ] Export to Notion
- [ ] Mobile app (React Native)
- [ ] Quiz performance analytics on the dashboard (scores are already saved)
- [ ] Onboarding flow — personalize from day one

---

## Built By

**Aadish Jain** · **G Sai Bharadwaj** · **D Kanishq**

B.Tech Computer Science and Engineering
SRM Institute of Science and Technology, Kattankulathur
Under the guidance of **Dr. Dinesh G**, Associate Professor

Course: 21CSE733T — Agent Ops and Industrial-Scale AI Deployment

---

## References

1. [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
2. [MemPalace](https://github.com/MemPalace/mempalace)
3. [OpenRouter API](https://openrouter.ai/docs)
4. [Clerk Authentication](https://clerk.com/docs)
5. [FastAPI](https://fastapi.tiangolo.com)
6. [Next.js App Router](https://nextjs.org/docs)
7. [ChromaDB](https://docs.trychroma.com)
8. [NirDiamant — GenAI Agents](https://github.com/NirDiamant/GenAI_Agents)

---

*Athena · v4.0 · MMXXVI*
