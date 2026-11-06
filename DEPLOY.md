# Deployment Guide

This guide covers deploying the AI Developer Debugger. Two paths are described:
a **build-from-source** path (recommended — most reliable) and a **Docker** path.

> Note: the Dockerfiles are provided as a working starting point but were not
> container-built in the environment where they were authored. Validate the
> image builds in your CI before relying on them in production.

## Prerequisites (all paths)

- A **managed PostgreSQL with pgvector** (e.g. Neon, Supabase, RDS, Railway PG).
  Ensure the `vector` extension is available.
- An LLM provider: OpenAI, or any OpenAI-compatible endpoint (Groq, etc.).
  Remember chat and embeddings can use **separate** endpoints
  (`OPENAI_BASE_URL` vs `OPENAI_EMBEDDING_BASE_URL`).

## Environment variables

Set these on the backend host (see `.env.example` for the full list):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | managed Postgres connection string |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | chat provider |
| `OPENAI_EMBEDDING_BASE_URL` / `_MODEL` | embeddings (if separate) |
| `EMBEDDING_DIMENSIONS` | must match the embedding model |
| `JWT_SECRET` | long random string |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `OAUTH_REDIRECT_URI` | for Google sign-in |
| `CLIENT_URL` | the deployed frontend origin |
| `ENABLE_WRITE_ACTIONS` | leave `false` unless you want approved fixes written |

On the **frontend** build, set `VITE_API_BASE_URL` to the backend's public URL.

## Path A — Build from source (recommended)

**Backend (Render / Railway / Fly):**
- Build command: `npm ci && npm run build --workspace shared && npm run build --workspace server`
- Start command: `node server/dist/db/migrate.js && node server/dist/index.js`
- Add the env vars above. Ensure `git` is available on the host (simple-git shells out to it).

**Frontend (Vercel / Netlify):**
- Build command: `npm ci && npm run build --workspace shared && npm run build --workspace client`
- Output directory: `client/dist`
- Set `VITE_API_BASE_URL` to the backend URL.
- Add an SPA rewrite so all routes serve `index.html` (Vercel: a catch-all rewrite to `/`).

**Database:** run the migrations once (`node server/dist/db/migrate.js`, or `npm run migrate` from source) against the managed Postgres.

## Path B — Docker

```bash
# Backend image
docker build -t ai-debugger-server -f server/Dockerfile .
docker run -p 4000:4000 --env-file .env ai-debugger-server

# Frontend image (bake in the API URL)
docker build -t ai-debugger-client -f client/Dockerfile \
  --build-arg VITE_API_BASE_URL=https://your-backend.example.com .
docker run -p 8080:80 ai-debugger-client
```

The backend container installs `git` and runs migrations on start.

## Google OAuth setup

1. In Google Cloud Console → Credentials, create an OAuth 2.0 Client ID (Web).
2. Authorized redirect URI: your `OAUTH_REDIRECT_URI`
   (e.g. `https://your-backend.example.com/api/auth/google/callback`).
3. Put the client id/secret in the backend env. The frontend auto-shows the
   "Sign in with Google" button when `GOOGLE_CLIENT_ID` is set.

## Post-deploy checklist

- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] Migrations applied (tables + `vector` extension present)
- [ ] Register/login works; project routes require a token
- [ ] An investigation streams tool calls and produces a diagnosis
- [ ] `JWT_SECRET` is a strong secret; `ENABLE_WRITE_ACTIONS` is intentional
