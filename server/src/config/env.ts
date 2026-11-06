import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load the repo-root .env (two levels up from server/src/config).
loadDotenv({ path: resolve(process.cwd(), '../.env') });
// Also allow a server-local .env to override during development.
loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .default('postgresql://debugger:debugger@localhost:5433/debugger'),

  // LLM configuration (used by the agent/RAG layers added in later modules).
  LLM_PROVIDER: z.enum(['openai']).default('openai'),
  OPENAI_API_KEY: z.string().default(''),
  // Optional OpenAI-compatible endpoint for CHAT (e.g. Ollama/Groq/OpenRouter).
  // When set, the API key is optional so you can run fully locally and free.
  OPENAI_BASE_URL: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),

  // Optional SEPARATE endpoint for EMBEDDINGS. Lets you use a strong chat
  // provider that lacks embeddings (e.g. Groq) while embedding locally with
  // Ollama. When empty, embeddings reuse the chat endpoint above.
  OPENAI_EMBEDDING_BASE_URL: z.string().default(''),
  OPENAI_EMBEDDING_API_KEY: z.string().default(''),

  // Where connected repositories are cloned for local investigation.
  WORKSPACE_DIR: z.string().default('./workspace'),
  // Shallow-clone depth (how much git history to fetch).
  CLONE_DEPTH: z.coerce.number().default(50),

  // Read-only token, only needed to clone private repos.
  GITHUB_TOKEN: z.string().default(''),

  // Safety bound on the agent's tool-calling loop.
  AGENT_MAX_STEPS: z.coerce.number().default(12),

  // Retries (with backoff) for transient LLM provider errors (e.g. 429s).
  LLM_MAX_RETRIES: z.coerce.number().default(4),

  // ---- Auth ----
  JWT_SECRET: z.string().default('dev-insecure-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Optional Google OAuth (provide to enable the "Sign in with Google" flow).
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  OAUTH_REDIRECT_URI: z
    .string()
    .default('http://localhost:4000/api/auth/google/callback'),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  // ---- Database MCP (read-only introspection target) ----
  // Defaults to the app's own Postgres; point at any read-only DB to inspect.
  DB_MCP_URL: z.string().default(''),

  // ---- Logs MCP ----
  // Directory of *.log files the logs MCP server searches.
  LOGS_DIR: z.string().default('./logs'),

  // Enable human-approved write actions (off by default = fully read-only).
  ENABLE_WRITE_ACTIONS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message rather than crashing deep in a query.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
