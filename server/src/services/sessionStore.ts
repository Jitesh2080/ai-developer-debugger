import type {
  DebugSessionDetail,
  DebugSessionSummary,
  Diagnosis,
  ProjectStats,
  Repository,
  ToolCallRecord,
} from '@ai-debugger/shared';
import { query, withTransaction } from '../db/pool.js';
import type { RecordedToolCall } from '../agent/events.js';

export const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000001';

type SessionStatus = DebugSessionSummary['status'];

export async function createSession(
  projectId: string,
  title: string,
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO debug_sessions (project_id, title, status)
     VALUES ($1, $2, 'running') RETURNING id`,
    [projectId, title],
  );
  return rows[0]!.id;
}

export async function setSessionStatus(
  sessionId: string,
  status: SessionStatus,
): Promise<void> {
  await query(
    `UPDATE debug_sessions SET status = $2, updated_at = now() WHERE id = $1`,
    [sessionId, status],
  );
}

export async function saveError(
  sessionId: string,
  rawText: string,
  errorType: string,
  technologies: string[],
): Promise<void> {
  await query(
    `INSERT INTO errors (debug_session_id, raw_text, error_type, technologies)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, rawText, errorType, technologies],
  );
}

export async function createAgentRun(
  sessionId: string,
  provider: string,
  model: string,
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO agent_runs (debug_session_id, provider, model, status)
     VALUES ($1, $2, $3, 'running') RETURNING id`,
    [sessionId, provider, model],
  );
  return rows[0]!.id;
}

export async function finishAgentRun(
  runId: string,
  status: 'completed' | 'failed',
  stepCount: number,
): Promise<void> {
  await query(
    `UPDATE agent_runs
       SET status = $2, step_count = $3, finished_at = now()
     WHERE id = $1`,
    [runId, status, stepCount],
  );
}

export async function saveToolCalls(
  runId: string,
  calls: RecordedToolCall[],
): Promise<void> {
  if (calls.length === 0) return;
  await withTransaction(async (client) => {
    for (const c of calls) {
      await client.query(
        `INSERT INTO tool_calls
           (agent_run_id, step_index, server_name, tool_name, arguments, result, status, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          runId,
          c.stepIndex,
          c.server,
          c.tool,
          JSON.stringify(c.arguments),
          JSON.stringify({ text: c.resultText }),
          c.status,
          c.durationMs,
        ],
      );
    }
  });
}

export async function saveSolution(
  sessionId: string,
  d: Diagnosis,
): Promise<void> {
  await query(
    `INSERT INTO solutions
       (debug_session_id, root_cause, suggested_fix, affected_files, evidence, confidence, doc_references)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      sessionId,
      d.rootCause,
      d.suggestedFix,
      JSON.stringify(d.affectedFiles),
      JSON.stringify(d.evidence),
      d.confidence,
      JSON.stringify(d.references),
    ],
  );
}

export async function listSessions(
  projectId: string,
): Promise<DebugSessionSummary[]> {
  const { rows } = await query<{
    id: string;
    project_id: string;
    title: string;
    status: SessionStatus;
    confidence: number | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT s.id, s.project_id, s.title, s.status,
            sol.confidence, s.created_at, s.updated_at
       FROM debug_sessions s
       LEFT JOIN solutions sol ON sol.debug_session_id = s.id
      WHERE s.project_id = $1
      ORDER BY s.created_at DESC`,
    [projectId],
  );
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    status: r.status,
    confidence: r.confidence,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getSessionDetail(
  sessionId: string,
): Promise<DebugSessionDetail | null> {
  const { rows } = await query<{
    id: string;
    project_id: string;
    title: string;
    status: SessionStatus;
    created_at: string;
    updated_at: string;
    raw_text: string | null;
    error_type: string | null;
    technologies: string[] | null;
  }>(
    `SELECT s.id, s.project_id, s.title, s.status, s.created_at, s.updated_at,
            e.raw_text, e.error_type, e.technologies
       FROM debug_sessions s
       LEFT JOIN errors e ON e.debug_session_id = s.id
      WHERE s.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return null;

  const toolCalls = await query<{
    id: string;
    step_index: number;
    server_name: string;
    tool_name: string;
    arguments: Record<string, unknown>;
    result: unknown;
    status: 'success' | 'error';
    duration_ms: number | null;
    created_at: string;
  }>(
    `SELECT tc.id, tc.step_index, tc.server_name, tc.tool_name, tc.arguments,
            tc.result, tc.status, tc.duration_ms, tc.created_at
       FROM tool_calls tc
       JOIN agent_runs ar ON ar.id = tc.agent_run_id
      WHERE ar.debug_session_id = $1
      ORDER BY tc.step_index ASC`,
    [sessionId],
  );

  const solutionRes = await query<{
    root_cause: string;
    suggested_fix: string;
    affected_files: string[];
    evidence: Diagnosis['evidence'];
    confidence: number;
    doc_references: Diagnosis['references'];
  }>(
    `SELECT root_cause, suggested_fix, affected_files, evidence, confidence, doc_references
       FROM solutions WHERE debug_session_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [sessionId],
  );
  const s = solutionRes.rows[0];
  const solution: Diagnosis | null = s
    ? {
        rootCause: s.root_cause,
        suggestedFix: s.suggested_fix,
        affectedFiles: s.affected_files,
        evidence: s.evidence,
        confidence: s.confidence,
        references: s.doc_references,
      }
    : null;

  const toolCallRecords: ToolCallRecord[] = toolCalls.rows.map((t) => ({
    id: t.id,
    stepIndex: t.step_index,
    serverName: t.server_name,
    toolName: t.tool_name,
    arguments: t.arguments,
    result: t.result,
    status: t.status,
    durationMs: t.duration_ms,
    createdAt: t.created_at,
  }));

  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    confidence: solution?.confidence ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorText: row.raw_text ?? '',
    errorType: row.error_type,
    technologies: row.technologies ?? [],
    toolCalls: toolCallRecords,
    solution,
  };
}

export async function getLatestRepository(
  projectId: string,
): Promise<Repository | null> {
  const { rows } = await query<{
    id: string;
    project_id: string;
    provider: string;
    url: string;
    default_branch: string;
    local_path: string | null;
    last_cloned_at: string | null;
    created_at: string;
  }>(
    `SELECT * FROM repositories WHERE project_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [projectId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    provider: r.provider,
    url: r.url,
    defaultBranch: r.default_branch,
    localPath: r.local_path,
    lastClonedAt: r.last_cloned_at,
    createdAt: r.created_at,
  };
}

export async function projectHasDocs(projectId: string): Promise<boolean> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM documents WHERE project_id = $1`,
    [projectId],
  );
  return Number(rows[0]?.count ?? '0') > 0;
}

/** Aggregate metrics for a project's investigations (for the observability panel). */
export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const sessions = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM debug_sessions
      WHERE project_id = $1 GROUP BY status`,
    [projectId],
  );
  const byStatus = new Map(sessions.rows.map((r) => [r.status, Number(r.count)]));
  const totalSessions = [...byStatus.values()].reduce((a, b) => a + b, 0);

  const conf = await query<{ avg: string | null }>(
    `SELECT AVG(sol.confidence)::numeric(10,1)::text AS avg
       FROM solutions sol
       JOIN debug_sessions s ON s.id = sol.debug_session_id
      WHERE s.project_id = $1`,
    [projectId],
  );

  const tools = await query<{ total: string; avg_ms: string | null }>(
    `SELECT COUNT(*)::text AS total, AVG(tc.duration_ms)::numeric(10,0)::text AS avg_ms
       FROM tool_calls tc
       JOIN agent_runs ar ON ar.id = tc.agent_run_id
       JOIN debug_sessions s ON s.id = ar.debug_session_id
      WHERE s.project_id = $1`,
    [projectId],
  );

  const steps = await query<{ avg: string | null }>(
    `SELECT AVG(ar.step_count)::numeric(10,1)::text AS avg
       FROM agent_runs ar
       JOIN debug_sessions s ON s.id = ar.debug_session_id
      WHERE s.project_id = $1`,
    [projectId],
  );

  const usage = await query<{ server_name: string; tool_name: string; count: string }>(
    `SELECT tc.server_name, tc.tool_name, COUNT(*)::text AS count
       FROM tool_calls tc
       JOIN agent_runs ar ON ar.id = tc.agent_run_id
       JOIN debug_sessions s ON s.id = ar.debug_session_id
      WHERE s.project_id = $1
      GROUP BY tc.server_name, tc.tool_name
      ORDER BY count DESC`,
    [projectId],
  );

  return {
    totalSessions,
    completedSessions: byStatus.get('completed') ?? 0,
    failedSessions: byStatus.get('failed') ?? 0,
    avgConfidence: conf.rows[0]?.avg ? Number(conf.rows[0].avg) : null,
    totalToolCalls: Number(tools.rows[0]?.total ?? '0'),
    avgToolDurationMs: tools.rows[0]?.avg_ms ? Number(tools.rows[0].avg_ms) : null,
    avgStepsPerRun: steps.rows[0]?.avg ? Number(steps.rows[0].avg) : null,
    toolUsage: usage.rows.map((r) => ({
      server: r.server_name,
      tool: r.tool_name,
      count: Number(r.count),
    })),
  };
}
