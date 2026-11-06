import type { Diagnosis } from './diagnosis.js';

/** REST API data-transfer objects shared between backend and frontend. */

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface Repository {
  id: string;
  projectId: string;
  provider: string;
  url: string;
  defaultBranch: string;
  localPath: string | null;
  lastClonedAt: string | null;
  createdAt: string;
}

export interface DocumentMeta {
  id: string;
  projectId: string;
  title: string;
  sourceType: string;
  byteSize: number;
  chunkCount?: number;
  createdAt: string;
}

export interface ToolCallRecord {
  id: string;
  stepIndex: number;
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  status: 'success' | 'error';
  durationMs: number | null;
  createdAt: string;
}

export interface DebugSessionSummary {
  id: string;
  projectId: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebugSessionDetail extends DebugSessionSummary {
  errorText: string;
  errorType: string | null;
  technologies: string[];
  toolCalls: ToolCallRecord[];
  solution: Diagnosis | null;
}

// ---- Request bodies ----

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface ConnectRepositoryRequest {
  url: string;
  defaultBranch?: string;
}

export interface StartInvestigationRequest {
  title?: string;
  errorText: string;
}

export interface FixProposal {
  id: string;
  debugSessionId: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  explanation: string;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  createdAt: string;
  resolvedAt: string | null;
}
