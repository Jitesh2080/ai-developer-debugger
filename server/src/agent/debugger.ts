import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Diagnosis } from '@ai-debugger/shared';
import { env } from '../config/env.js';
import { getLlmProvider } from '../llm/index.js';
import type { LlmMessage, LlmProvider, LlmToolSchema } from '../llm/provider.js';
import {
  McpRegistry,
  type AggregatedTool,
  type McpContext,
} from '../mcp/registry.js';
import type { AgentEmitter, RecordedToolCall } from './events.js';
import { ANALYSIS_PROMPT, FINAL_INSTRUCTION, SYSTEM_PROMPT } from './prompts.js';

export interface InvestigationInput {
  projectId: string;
  repoPath?: string;
  errorText: string;
  hasDocs: boolean;
}

export interface InvestigationResult {
  diagnosis: Diagnosis;
  toolCalls: RecordedToolCall[];
  errorType: string;
  technologies: string[];
  stepCount: number;
}

/** Minimal surface of the MCP host the agent relies on (mockable in tests). */
export interface McpRegistryLike {
  connectAll(ctx: McpContext): Promise<void>;
  listTools(): AggregatedTool[];
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ server: string; text: string; isError: boolean }>;
  close(): Promise<void>;
}

export interface AgentDeps {
  provider?: LlmProvider;
  registry?: McpRegistryLike;
}

const analysisSchema = z.object({
  errorType: z.string(),
  technologies: z.array(z.string()),
  plan: z.array(z.string()),
});

const diagnosisSchema = z.object({
  rootCause: z.string(),
  evidence: z
    .array(
      z.object({
        kind: z.enum(['source', 'commit', 'log', 'documentation', 'schema']),
        title: z.string(),
        detail: z.string(),
        verified: z.boolean(),
        location: z.string().optional(),
      }),
    )
    .default([]),
  suggestedFix: z.string(),
  affectedFiles: z.array(z.string()).default([]),
  confidence: z.number().int().min(0).max(100),
  references: z
    .array(
      z.object({
        title: z.string(),
        source: z.string(),
        snippet: z.string().optional(),
      }),
    )
    .default([]),
});

/** Strip ```json fences the model sometimes adds, then JSON.parse. */
function parseJsonLoose(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

function summarize(text: string, max = 180): string {
  const firstLine = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  const base = firstLine.length >= 20 ? firstLine : text.replace(/\s+/g, ' ');
  return base.length > max ? `${base.slice(0, max)}…` : base;
}

/**
 * Runs a full multi-step investigation: analyse the error, let the LLM drive
 * MCP tool calls to gather evidence, then produce a structured diagnosis.
 * Every phase is streamed through `emit`.
 */
export async function runInvestigation(
  input: InvestigationInput,
  emit: AgentEmitter,
  deps: AgentDeps = {},
): Promise<InvestigationResult> {
  const provider = deps.provider ?? getLlmProvider();
  const registry = deps.registry ?? new McpRegistry();
  const recorded: RecordedToolCall[] = [];

  try {
    await registry.connectAll({
      projectId: input.projectId,
      repoPath: input.repoPath,
    });

    // ---- Phase 1: analyse & plan ----
    const analysisRaw = await provider.chatWithTools(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${ANALYSIS_PROMPT}\n\nERROR:\n${input.errorText}`,
        },
      ],
      [],
      { responseFormatJson: true },
    );

    let errorType = 'unknown';
    let technologies: string[] = [];
    try {
      const analysis = analysisSchema.parse(parseJsonLoose(analysisRaw.content));
      errorType = analysis.errorType;
      technologies = analysis.technologies;
      emit({ type: 'error_parsed', errorType, technologies });
      emit({ type: 'plan', steps: analysis.plan });
    } catch {
      emit({ type: 'error_parsed', errorType, technologies });
    }

    // ---- Phase 2: tool-driven investigation ----
    const tools: LlmToolSchema[] = registry.listTools().map((t) => ({
      name: t.name,
      description: `[${t.server}] ${t.description}`,
      parameters: t.inputSchema,
    }));

    emit({
      type: 'status',
      message:
        tools.length > 0
          ? `Investigating with ${tools.length} MCP tools…`
          : 'No MCP tools available; reasoning from the error alone.',
    });

    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildInvestigationPrompt(input),
      },
    ];

    let step = 0;
    const maxSteps = env.AGENT_MAX_STEPS;
    while (step < maxSteps) {
      const turn = await provider.chatWithTools(messages, tools);

      if (turn.toolCalls.length === 0) {
        if (turn.content.trim()) emit({ type: 'reasoning', message: turn.content });
        break;
      }

      messages.push({
        role: 'assistant',
        content: turn.content,
        toolCalls: turn.toolCalls,
      });

      for (const call of turn.toolCalls) {
        step += 1;
        const id = randomUUID();
        let args: Record<string, unknown> = {};
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          args = {};
        }

        const serverName =
          registry.listTools().find((t) => t.name === call.name)?.server ??
          'unknown';
        emit({
          type: 'tool_call_start',
          id,
          server: serverName,
          tool: call.name,
          arguments: args,
        });

        const startedAt = Date.now();
        const result = await registry.callTool(call.name, args);
        const durationMs = Date.now() - startedAt;

        recorded.push({
          stepIndex: step,
          server: result.server,
          tool: call.name,
          arguments: args,
          resultText: result.text,
          status: result.isError ? 'error' : 'success',
          durationMs,
        });

        emit({
          type: 'tool_call_result',
          id,
          server: result.server,
          tool: call.name,
          status: result.isError ? 'error' : 'success',
          summary: summarize(result.text),
          durationMs,
        });

        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: result.text.slice(0, 8000),
        });
      }
    }

    // ---- Phase 3: final structured diagnosis ----
    emit({ type: 'status', message: 'Analyzing evidence…', level: 'info' });
    messages.push({ role: 'user', content: FINAL_INSTRUCTION });
    const finalRaw = await provider.chatWithTools(messages, [], {
      responseFormatJson: true,
    });

    const diagnosis = coerceDiagnosis(finalRaw.content);
    emit({ type: 'final', solution: diagnosis });

    return {
      diagnosis,
      toolCalls: recorded,
      errorType,
      technologies,
      stepCount: step,
    };
  } finally {
    await registry.close();
  }
}

function buildInvestigationPrompt(input: InvestigationInput): string {
  const context: string[] = [];
  context.push(
    input.repoPath
      ? 'A source repository is connected — use the github tools to search code and inspect commits/diffs.'
      : 'No repository is connected.',
  );
  context.push(
    input.hasDocs
      ? 'Project documentation is available — use search_docs when framework/DB behaviour needs verifying.'
      : 'No documentation is available.',
  );
  return `Investigate this error and determine its root cause.\n\n${context.join(
    '\n',
  )}\n\nERROR:\n${input.errorText}`;
}

/** Validate the model's final JSON; fall back to a low-confidence diagnosis. */
function coerceDiagnosis(raw: string): Diagnosis {
  try {
    return diagnosisSchema.parse(parseJsonLoose(raw)) as Diagnosis;
  } catch {
    return {
      rootCause:
        raw.trim() ||
        'The agent could not produce a structured diagnosis for this error.',
      evidence: [],
      suggestedFix:
        'Review the gathered evidence manually; the diagnosis could not be parsed.',
      affectedFiles: [],
      confidence: 20,
      references: [],
    };
  }
}
