import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '@ai-debugger/shared';
import {
  runInvestigation,
  type McpRegistryLike,
} from '../src/agent/debugger.js';
import type {
  ChatResult,
  LlmMessage,
  LlmProvider,
  LlmToolSchema,
} from '../src/llm/provider.js';

/**
 * A scripted LLM provider that returns a fixed sequence of responses so we can
 * assert the agent's multi-step tool-calling orchestration deterministically.
 */
class ScriptedProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'mock-model';
  private calls = 0;

  async chatWithTools(
    _messages: LlmMessage[],
    _tools: LlmToolSchema[],
  ): Promise<ChatResult> {
    const step = this.calls++;
    switch (step) {
      case 0: // analysis phase
        return {
          content: JSON.stringify({
            errorType: 'SQL syntax error',
            technologies: ['SAP HANA', 'SQL'],
            plan: ['Search code for DEFINER', 'Inspect the generator'],
          }),
          toolCalls: [],
        };
      case 1: // investigation turn -> call a tool
        return {
          content: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'search_code',
              arguments: JSON.stringify({ query: 'DEFINERLANGUAGE' }),
            },
          ],
        };
      case 2: // investigation turn -> stop calling tools
        return { content: 'I have gathered enough evidence.', toolCalls: [] };
      default: // final diagnosis
        return {
          content: JSON.stringify({
            rootCause:
              'Missing space between DEFINER clause and LANGUAGE keyword in generated SQL.',
            evidence: [
              {
                kind: 'source',
                title: 'procedureGenerator.ts',
                detail: 'String concatenation omits a space.',
                verified: true,
                location: 'src/procedureGenerator.ts:42',
              },
            ],
            suggestedFix: 'Add a space between the DEFINER and LANGUAGE tokens.',
            affectedFiles: ['src/procedureGenerator.ts'],
            confidence: 88,
            references: [],
          }),
          toolCalls: [],
        };
    }
  }

  async embed(): Promise<number[][]> {
    return [];
  }
}

class MockRegistry implements McpRegistryLike {
  calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  closed = false;

  async connectAll(): Promise<void> {}

  listTools() {
    return [
      {
        server: 'github',
        name: 'search_code',
        description: 'Search the repository source code',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ];
  }

  async callTool(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    return {
      server: 'github',
      text: 'src/procedureGenerator.ts:42: sql += "DEFINER=X" + "LANGUAGE SQLSCRIPT"',
      isError: false,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

describe('runInvestigation', () => {
  it('drives a multi-step investigation and returns a structured diagnosis', async () => {
    const events: AgentEvent[] = [];
    const registry = new MockRegistry();

    const result = await runInvestigation(
      {
        projectId: 'p1',
        repoPath: '/tmp/repo',
        errorText: "HanaError: SQL syntax error near 'DEFINERLANGUAGE'",
        hasDocs: false,
      },
      (e) => events.push(e),
      { provider: new ScriptedProvider(), registry },
    );

    // The agent classified the error and emitted a plan.
    const types = events.map((e) => e.type);
    expect(types).toContain('error_parsed');
    expect(types).toContain('plan');
    expect(types).toContain('tool_call_start');
    expect(types).toContain('tool_call_result');
    expect(types).toContain('final');

    // It actually called the MCP tool the model requested.
    expect(registry.calls).toHaveLength(1);
    expect(registry.calls[0]!.name).toBe('search_code');
    expect(registry.calls[0]!.args).toEqual({ query: 'DEFINERLANGUAGE' });

    // The run metadata and recorded tool calls are correct.
    expect(result.errorType).toBe('SQL syntax error');
    expect(result.technologies).toContain('SAP HANA');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.tool).toBe('search_code');
    expect(result.toolCalls[0]!.status).toBe('success');

    // The structured diagnosis parsed correctly.
    expect(result.diagnosis.confidence).toBe(88);
    expect(result.diagnosis.affectedFiles).toContain('src/procedureGenerator.ts');
    expect(result.diagnosis.evidence[0]!.verified).toBe(true);

    // The MCP registry was cleaned up.
    expect(registry.closed).toBe(true);
  });

  it('falls back to a low-confidence diagnosis when the final JSON is invalid', async () => {
    class BadFinalProvider extends ScriptedProvider {
      override async chatWithTools(m: LlmMessage[], t: LlmToolSchema[]) {
        const res = await super.chatWithTools(m, t);
        // Corrupt only the final diagnosis response.
        if (res.content.includes('rootCause')) {
          return { content: 'not valid json', toolCalls: [] };
        }
        return res;
      }
    }

    const events: AgentEvent[] = [];
    const result = await runInvestigation(
      { projectId: 'p1', errorText: 'boom', hasDocs: false },
      (e) => events.push(e),
      { provider: new BadFinalProvider(), registry: new MockRegistry() },
    );

    expect(result.diagnosis.confidence).toBeLessThan(50);
    expect(events.some((e) => e.type === 'final')).toBe(true);
  });
});
