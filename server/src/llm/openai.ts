import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { env } from '../config/env.js';
import type {
  ChatOptions,
  ChatResult,
  LlmMessage,
  LlmProvider,
  LlmToolSchema,
} from './provider.js';

/** OpenAI implementation of the provider interface (chat + embeddings). */
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly client: OpenAI;
  private readonly embeddingClient: OpenAI;
  private readonly embeddingModel: string;

  constructor() {
    const usingCustomEndpoint = Boolean(env.OPENAI_BASE_URL);
    if (!env.OPENAI_API_KEY && !usingCustomEndpoint) {
      throw new Error(
        'OPENAI_API_KEY is not set. Add it to your .env, or set OPENAI_BASE_URL to use a local/compatible endpoint.',
      );
    }
    // Chat client (OPENAI_BASE_URL / OPENAI_API_KEY).
    this.client = new OpenAI({
      // Local endpoints (e.g. Ollama) don't require a real key, but the SDK
      // needs a non-empty string.
      apiKey: env.OPENAI_API_KEY || 'not-needed',
      // SDK retries transient errors (429/5xx) with exponential backoff.
      maxRetries: env.LLM_MAX_RETRIES,
      ...(usingCustomEndpoint ? { baseURL: env.OPENAI_BASE_URL } : {}),
    });

    // Embedding client: a separate endpoint when configured (so a chat-only
    // provider like Groq can pair with local Ollama embeddings); otherwise the
    // same client as chat.
    if (env.OPENAI_EMBEDDING_BASE_URL) {
      this.embeddingClient = new OpenAI({
        apiKey: env.OPENAI_EMBEDDING_API_KEY || 'not-needed',
        maxRetries: env.LLM_MAX_RETRIES,
        baseURL: env.OPENAI_EMBEDDING_BASE_URL,
      });
    } else {
      this.embeddingClient = this.client;
    }

    this.model = env.OPENAI_MODEL;
    this.embeddingModel = env.OPENAI_EMBEDDING_MODEL;
  }

  async chatWithTools(
    messages: LlmMessage[],
    tools: LlmToolSchema[],
    options: ChatOptions = {},
  ): Promise<ChatResult> {
    const openAiTools: ChatCompletionTool[] = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: options.temperature ?? 0.1,
      messages: messages.map(toOpenAiMessage),
      ...(openAiTools.length > 0 ? { tools: openAiTools, tool_choice: 'auto' } : {}),
      ...(options.responseFormatJson
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    });

    const choice = response.choices[0]?.message;
    const structuredCalls =
      choice?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })) ?? [];

    // Some OpenAI-compatible backends (notably Ollama with certain models)
    // return a tool call as plain-text JSON in `content` instead of in the
    // structured `tool_calls` field. Recover those so local models still work.
    if (structuredCalls.length === 0 && tools.length > 0 && choice?.content) {
      const recovered = recoverToolCallsFromText(
        choice.content,
        new Set(tools.map((t) => t.name)),
      );
      if (recovered.length > 0) {
        return { content: '', toolCalls: recovered };
      }
    }

    return {
      content: choice?.content ?? '',
      toolCalls: structuredCalls,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.embeddingClient.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });
    // Preserve input order.
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

/** Map our neutral message shape onto the OpenAI SDK's message union. */
function toOpenAiMessage(m: LlmMessage): ChatCompletionMessageParam {
  switch (m.role) {
    case 'system':
      return { role: 'system', content: m.content };
    case 'user':
      return { role: 'user', content: m.content };
    case 'tool':
      return {
        role: 'tool',
        content: m.content,
        tool_call_id: m.toolCallId ?? '',
      };
    case 'assistant':
      return {
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            }
          : {}),
      };
  }
}

/**
 * Recovers tool calls that a model emitted as text instead of in the
 * structured `tool_calls` field. Handles pure-JSON content AND tool-call JSON
 * embedded in surrounding prose (common with local models), accepting a
 * `{ "name", "arguments" }` object. Only names in `knownTools` are accepted, so
 * ordinary JSON answers (e.g. the final diagnosis) are never misread.
 */
export function recoverToolCallsFromText(
  content: string,
  knownTools: Set<string>,
): Array<{ id: string; name: string; arguments: string }> {
  const objects = extractJsonObjects(content);
  const calls: Array<{ id: string; name: string; arguments: string }> = [];

  for (const [i, obj] of objects.entries()) {
    if (!obj || typeof obj !== 'object') continue;
    const rec = obj as Record<string, unknown>;
    const name = rec.name;
    if (typeof name !== 'string' || !knownTools.has(name)) continue;
    const args = rec.arguments ?? rec.parameters ?? {};
    calls.push({
      id: `recovered_${Date.now()}_${i}`,
      name,
      arguments: typeof args === 'string' ? args : JSON.stringify(args),
    });
  }

  return calls;
}

/**
 * Scans text for balanced top-level `{...}` regions and returns those that
 * parse as JSON. String contents (and escapes) are respected so braces inside
 * string values don't throw off the depth counting.
 */
function extractJsonObjects(text: string): unknown[] {
  const results: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          try {
            results.push(JSON.parse(text.slice(start, i + 1)));
          } catch {
            // Not valid JSON; ignore this region.
          }
          start = -1;
        }
      }
    }
  }

  return results;
}
