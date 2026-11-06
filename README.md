# AI Developer Debugger

An **MCP-powered agentic AI debugging platform**. Instead of asking an LLM "what does this error mean?", it lets an AI agent *investigate your actual project* — searching source code, inspecting git history, and retrieving documentation through the **Model Context Protocol (MCP)** — then returns an evidence-backed root cause, a suggested fix, and a confidence score. The investigation streams to the UI in real time over SSE.

```
User error
   ↓
AI Debugging Agent  ──plans──►  selects MCP tools  ──►  GitHub/Git + Docs MCP servers
   ↑                                                         ↓
   └────────── reasons over evidence ◄── tool results ◄──────┘
   ↓
Root cause + evidence (verified vs. assumption) + suggested fix + confidence
```

This is the **MVP**. See the [Roadmap](#roadmap) for what's deferred.

## Why this is agentic (and not a chatbot)

The agent runs a real tool-calling loop: it classifies the error, forms a plan, then repeatedly decides which MCP tool to call next, reads the result, and keeps going until it has enough evidence — only then does it produce a structured diagnosis. Tools are exposed through MCP servers that run as **separate processes** the backend talks to over stdio, exactly as a real MCP host would.

## Architecture

```
ai-developer-debugger/
├── shared/   # Shared TypeScript types (SSE events, diagnosis, API contracts)
├── server/   # Node + Express: MCP host, agent loop, RAG, REST+SSE API
│   └── src/
│       ├── agent/      # the agentic debugging loop + prompts
│       ├── llm/        # provider abstraction (OpenAI implementation)
│       ├── mcp/        # MCP host client + registry
│       │   └── servers/
│       │       ├── github/  # read-only Git/GitHub MCP server (local clone)
│       │       └── docs/     # documentation MCP server (pgvector RAG)
│       ├── rag/        # extraction, chunking, embeddings, retrieval
│       ├── routes/     # projects, repositories, documents, debug (SSE)
│       └── db/         # schema + migrations (Postgres + pgvector)
└── client/   # React + Vite + Tailwind frontend
```

### Tech stack

- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Backend:** Node.js, TypeScript, Express
- **AI:** LLM provider abstraction (OpenAI by default), tool calling, multi-step reasoning
- **MCP:** `@modelcontextprotocol/sdk` — custom MCP host client + custom MCP servers
- **Database:** PostgreSQL + pgvector
- **RAG:** document ingestion → chunking → embeddings → vector similarity search
- **Realtime:** Server-Sent Events (SSE)
- **Testing:** Vitest + Supertest

## Prerequisites

- Node.js ≥ 20
- Docker (for the local Postgres + pgvector database)
- An OpenAI API key (used for chat + embeddings)

## Setup

```bash
# 1. Install dependencies (installs all workspaces)
npm install

# 2. Configure environment
cp .env.example .env
#   → set OPENAI_API_KEY in .env

# 3. Start Postgres + pgvector
npm run db:up

# 4. Apply the database schema
npm run migrate
```

## Run

```bash
npm run dev
```

- Backend: http://localhost:4000
- Frontend: http://localhost:5173

The `dev` script builds the `shared` package first, then runs the server and client together.

### Run fully free & local (Ollama)

Because the backend uses the OpenAI SDK, you can point it at any **OpenAI-compatible** endpoint and pay nothing. With [Ollama](https://ollama.com):

```bash
ollama pull qwen2.5-coder      # a tool-calling capable chat model
ollama pull nomic-embed-text   # embeddings

# in .env:
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=qwen2.5-coder
OPENAI_EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
```

The embedding dimension sizes the database vector column at migrate time, so it must match your embedding model. **If you change `EMBEDDING_DIMENSIONS` after already migrating, recreate the DB** so the column is resized:

```bash
npm run db:down && npm run db:up && npm run migrate
```

> Tool calling quality varies by local model; `qwen2.5-coder` and `llama3.1` handle it well. Hosted OpenAI-compatible providers (Groq, OpenRouter, Together) work the same way — just set `OPENAI_BASE_URL` and `OPENAI_API_KEY`.

### Free *and* strong (Groq chat + local embeddings)

For much sharper diagnoses at **$0**, use Groq's free tier (a 70B-class model) for chat and keep embeddings local in Ollama. Chat and embeddings can target **separate** endpoints:

```bash
# Chat → Groq (free API key from https://console.groq.com/keys)
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=gsk_your_groq_key
OPENAI_MODEL=llama-3.3-70b-versatile

# Embeddings → local Ollama (Groq has no embeddings API)
OPENAI_EMBEDDING_BASE_URL=http://localhost:11434/v1
OPENAI_EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
```

When `OPENAI_EMBEDDING_BASE_URL` is empty, embeddings reuse the chat endpoint. Remember to recreate the DB if `EMBEDDING_DIMENSIONS` changes.

## Usage

1. **Create a project** on the home page.
2. **Connect a GitHub repository** by URL — it's cloned locally for read-only investigation. (Public repos need no token; set `GITHUB_TOKEN` for private ones.)
3. **Upload documentation** (`.md`, `.txt`, `.pdf`) — it's chunked, embedded, and stored in pgvector.
4. **Enter an error / stack trace** (try the built-in sample: `HanaError: SQL syntax error near 'DEFINERLANGUAGE'`).
5. **Start the investigation** and watch the agent work in real time — each MCP tool call appears with its arguments and result summary.
6. Read the **diagnosis**: root cause, evidence (each tagged **Verified** or **Assumption**), suggested fix, affected files, confidence, and documentation references.
7. Every session is **saved** and replayable from the project's History.

## MCP servers & tools

| Server | Transport | Tools | Access |
| --- | --- | --- | --- |
| `github` | stdio | `search_code`, `get_file`, `list_files`, `get_recent_commits`, `get_commit`, `get_git_diff` | read-only, on a local clone |
| `docs` | stdio | `search_docs`, `get_document` | read-only, pgvector RAG |
| `database` | stdio | `get_schema`, `get_table_schema`, `get_column_info`, `validate_sql`, `explain_query` | read-only; EXPLAIN-only, never executes queries |
| `logs` | stdio | `search_logs`, `get_recent_logs`, `get_error_context` | read-only, over `*.log` in `LOGS_DIR` |

All tools are **read-only**: no file writes, no SQL execution. The database server
only ever PLANs statements (EXPLAIN, no ANALYZE) inside a rolled-back READ ONLY
transaction. The one exception is the opt-in, human-approved fix flow below.

## Authentication

All `/api/projects/*` routes require a JWT. Users register/login with email +
password, or **Sign in with Google** (enabled when `GOOGLE_CLIENT_ID` is set).
Projects are scoped per user — you only see your own. See `.env.example` for the
auth and OAuth variables.

## Human-in-the-loop fixes

After a diagnosis, the agent can **propose a corrected file**. You review the
proposed content + explanation and **Approve** or **Reject**. Nothing is written
to disk unless `ENABLE_WRITE_ACTIONS=true` — and even then, only the file in the
local clone, only on approval. Read-only is the default.

## Observability

Each project has a metrics panel (and `GET /api/projects/:id/stats`): number of
investigations, completion rate, average confidence, tool-call counts, average
steps per run, average tool duration, and most-used tools — all derived from the
`agent_runs` / `tool_calls` tables.

## Testing

```bash
npm test            # runs the server test suite
```

Covers RAG chunking, the repository path-traversal guard, text-emitted tool-call
recovery, the agent's multi-step tool-calling workflow (mocked LLM + mocked MCP),
and API auth/validation.

## Configuration

See [`.env.example`](.env.example). Key variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (defaults to the Docker Compose DB on port 5433) |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | chat provider (OpenAI, or any compatible endpoint like Groq/Ollama) |
| `OPENAI_EMBEDDING_BASE_URL` / `_MODEL` | optional separate embedding endpoint |
| `EMBEDDING_DIMENSIONS` | must match the embedding model; sizes the DB `vector(...)` column at migrate time |
| `WORKSPACE_DIR` / `CLONE_DEPTH` | where repos are cloned, and shallow-clone depth |
| `AGENT_MAX_STEPS` / `LLM_MAX_RETRIES` | tool-loop bound; retries for transient 429s |
| `JWT_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | auth + Google OAuth |
| `DB_MCP_URL` / `LOGS_DIR` | Database MCP target; Logs MCP log directory |
| `ENABLE_WRITE_ACTIONS` | allow approved fixes to be written to the clone (default off) |

## Deployment

See [`DEPLOY.md`](DEPLOY.md) for build-from-source (Render/Railway + Vercel),
Docker, managed Postgres, and Google OAuth setup.

## Security notes

- Secrets live only in `.env` (gitignored); `.env.example` documents the required keys.
- All `/api/projects/*` routes require a JWT; project access is checked per user.
- MCP tool inputs are validated with zod; every tool execution is logged to `tool_calls`.
- Database access via MCP is read-only (EXPLAIN-only, rolled back); file writes require explicit human approval and an opt-in flag.
- `npm audit` reports advisories in some transitive/dev dependencies (Vite/esbuild, simple-git). These are pinned to avoid breaking major upgrades; revisit before production.

## Roadmap (what's next)

- **Semantic code search** — embed repo code into pgvector so `search_code` matches by meaning, not just `git grep` (the main remaining capability).
- Warm/pooled MCP servers and clone search caching for speed.
- Richer observability (token/cost tracking) and API rate limiting.
- Cancel-in-progress investigations from the UI.

## License

MIT
