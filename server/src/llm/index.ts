import { env } from '../config/env.js';
import { OpenAiProvider } from './openai.js';
import type { LlmProvider } from './provider.js';

let cached: LlmProvider | null = null;

/**
 * Returns the configured LLM provider, instantiated lazily so that a missing
 * API key only errors when the LLM is actually used (not at import time).
 */
export function getLlmProvider(): LlmProvider {
  if (cached) return cached;
  switch (env.LLM_PROVIDER) {
    case 'openai':
      cached = new OpenAiProvider();
      return cached;
    default:
      // Exhaustiveness guard; env schema already restricts the values.
      throw new Error(`Unsupported LLM_PROVIDER: ${env.LLM_PROVIDER as string}`);
  }
}

/** Test seam: override the provider (e.g. with a mock) and reset. */
export function __setLlmProvider(provider: LlmProvider | null): void {
  cached = provider;
}

export type { LlmProvider } from './provider.js';
export * from './provider.js';
