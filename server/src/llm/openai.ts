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
  private readonly embeddingModel: string;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      throw new Error(
        'OPENAI_API_KEY is not set. Add it to your .env to use the OpenAI provider.',
      );
    }
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
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
    return {
      content: choice?.content ?? '',
      toolCalls:
        choice?.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })) ?? [],
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.client.embeddings.create({
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
