import type { AgentEvent } from '@ai-debugger/shared';

/** A sink the agent pushes real-time events into (wired to SSE or a test spy). */
export type AgentEmitter = (event: AgentEvent) => void;

/** A tool call executed during an investigation, persisted after the run. */
export interface RecordedToolCall {
  stepIndex: number;
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
  resultText: string;
  status: 'success' | 'error';
  durationMs: number;
}
