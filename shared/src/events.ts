import type { Diagnosis } from './diagnosis.js';

/**
 * Server-Sent Events streamed from the backend to the frontend during a live
 * investigation. Every event is a member of this discriminated union; the
 * frontend switches on `type` to render the real-time timeline.
 */

export type ToolCallStatus = 'success' | 'error';

export interface StatusEvent {
  type: 'status';
  message: string;
  level?: 'info' | 'success' | 'warn';
}

export interface ErrorParsedEvent {
  type: 'error_parsed';
  errorType: string;
  technologies: string[];
}

export interface PlanEvent {
  type: 'plan';
  steps: string[];
}

export interface ToolCallStartEvent {
  type: 'tool_call_start';
  id: string;
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResultEvent {
  type: 'tool_call_result';
  id: string;
  server: string;
  tool: string;
  status: ToolCallStatus;
  /** A short, human-readable summary of what the tool returned. */
  summary: string;
  durationMs: number;
}

export interface ReasoningEvent {
  type: 'reasoning';
  message: string;
}

export interface FinalEvent {
  type: 'final';
  solution: Diagnosis;
}

export interface DoneEvent {
  type: 'done';
  sessionId: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type AgentEvent =
  | StatusEvent
  | ErrorParsedEvent
  | PlanEvent
  | ToolCallStartEvent
  | ToolCallResultEvent
  | ReasoningEvent
  | FinalEvent
  | DoneEvent
  | ErrorEvent;

export type AgentEventType = AgentEvent['type'];
