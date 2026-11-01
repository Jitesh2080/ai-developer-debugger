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

All tools are **read-only** in the MVP (Section 12 of the spec): no file writes, no SQL execution.

## Testing

```bash
npm test            # runs the server test suite
```

Covers RAG chunking, the repository path-traversal guard, the agent's multi-step tool-calling workflow (with a mocked LLM + mocked MCP), and API request validation.

## Configuration

See [`.env.example`](.env.example). Key variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (defaults to the Docker Compose DB on port 5433) |
| `OPENAI_API_KEY` | OpenAI key for chat + embeddings (not required when `OPENAI_BASE_URL` is set) |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible endpoint for local/free providers (e.g. Ollama) |
| `OPENAI_MODEL` / `OPENAI_EMBEDDING_MODEL` | model selection |
| `EMBEDDING_DIMENSIONS` | must match the embedding model; sizes the DB `vector(...)` column at migrate time |
| `WORKSPACE_DIR` | where repositories are cloned |
| `AGENT_MAX_STEPS` | safety bound on the tool-calling loop |

## Security notes

- Secrets live only in `.env` (gitignored); `.env.example` documents the required keys.
- MCP tool inputs are validated with zod; every tool execution is logged to the `tool_calls` table.
- Database access via MCP is read-only.
- `npm audit` reports advisories in some transitive/dev dependencies (e.g. the Vite/esbuild and simple-git toolchains). These are pinned to avoid breaking major upgrades in the MVP; revisit before production.

## Roadmap (post-MVP)

- Logs MCP, Database MCP (schema/validation), and a standalone Git MCP server
- Authentication (JWT + Google OAuth) and per-project authorization
- Human-in-the-loop approval for any write operations
- Docker Compose for the full stack, GitHub Actions CI/CD, and cloud deployment
- Advanced observability of agent runs

## License

MIT
