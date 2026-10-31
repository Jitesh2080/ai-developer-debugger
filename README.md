# AI Developer Debugger

An **MCP-powered agentic AI debugging platform**. Instead of asking an LLM "what does this error mean?", it lets an AI agent *investigate your actual project* — searching source code, inspecting git history, and retrieving documentation through the **Model Context Protocol (MCP)** — then returns an evidence-backed root cause, a suggested fix, and a confidence score. The investigation streams to the UI in real time.

> This is the **MVP**. See `docs`/the plan for the deferred roadmap (auth, Logs/DB MCP servers, human-in-the-loop write approvals, CI/CD).

## Monorepo layout

```
ai-developer-debugger/
├── shared/   # Shared TypeScript types (SSE events, API contracts)
├── server/   # Node + Express backend: MCP host + agent + RAG + API
├── client/   # React + Vite + Tailwind frontend
└── docker-compose.yml  # Local Postgres + pgvector
```

## Status

Scaffolding in place. Setup and run instructions are added in the final step of the build. See `.env.example` for required configuration.
