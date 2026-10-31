/**
 * Provider-agnostic LLM interface. The agent and RAG layers depend only on
 * this interface, so swapping providers (e.g. OpenAI -> another vendor) does
 * not touch the core application — only a new implementation + the factory in
 * ./index.ts.
 */

/** A tool exposed to the model, described with a JSON Schema parameter spec. */
export interface LlmToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A tool call the model wants to make. `arguments` is a raw JSON string. */
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** Present on assistant messages that requested tool calls. */
  toolCalls?: LlmToolCall[];
  /** Present on `tool` messages: which tool call this result answers. */
  toolCallId?: string;
  /** Tool name, for `tool` messages. */
  name?: string;
}

export interface ChatResult {
  /** Assistant free-text content (may be empty when only tool calls returned). */
  content: string;
  toolCalls: LlmToolCall[];
}

export interface ChatOptions {
  temperature?: number;
  /** Force the model to emit a single JSON object as its content. */
  responseFormatJson?: boolean;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;

  /** One turn of a tool-enabled chat completion. */
  chatWithTools(
    messages: LlmMessage[],
    tools: LlmToolSchema[],
    options?: ChatOptions,
  ): Promise<ChatResult>;

  /** Embed one or more texts into vectors for semantic search. */
  embed(texts: string[]): Promise<number[][]>;
}
