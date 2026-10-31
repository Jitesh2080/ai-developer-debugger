/**
 * The structured diagnosis produced by the agent at the end of an
 * investigation. This is the contract shared between the backend agent and
 * the frontend result view.
 */

export type EvidenceKind =
  | 'source' // a source file / code snippet
  | 'commit' // a git commit or diff
  | 'log' // an application log entry
  | 'documentation' // a retrieved doc chunk
  | 'schema'; // database/schema metadata

export interface Evidence {
  kind: EvidenceKind;
  title: string;
  detail: string;
  /**
   * Whether this evidence was directly observed via a tool call (verified) or
   * is an inference the model made (assumption). The UI renders these
   * differently so users can tell fact from guess.
   */
  verified: boolean;
  /** Optional pointer, e.g. "src/db/query.ts:42" or a commit SHA. */
  location?: string;
}

export interface DocReference {
  title: string;
  source: string;
  snippet?: string;
}

export interface Diagnosis {
  rootCause: string;
  evidence: Evidence[];
  suggestedFix: string;
  affectedFiles: string[];
  /** 0..100 */
  confidence: number;
  references: DocReference[];
}
