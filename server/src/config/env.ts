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
  // Optional OpenAI-compatible endpoint (e.g. Ollama/Groq/OpenRouter). When set,
  // the API key is optional so you can run fully locally and free.
  OPENAI_BASE_URL: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),

  // Where connected repositories are cloned for local investigation.
  WORKSPACE_DIR: z.string().default('./workspace'),

  // Read-only token, only needed to clone private repos.
  GITHUB_TOKEN: z.string().default(''),

  // Safety bound on the agent's tool-calling loop.
  AGENT_MAX_STEPS: z.coerce.number().default(12),
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
