import { Router } from 'express';
import { z } from 'zod';
import type { AgentEvent } from '@ai-debugger/shared';
import { runInvestigation } from '../agent/debugger.js';
import { getLlmProvider } from '../llm/index.js';
import {
  createAgentRun,
  createSession,
  finishAgentRun,
  getLatestRepository,
  getSessionDetail,
  listSessions,
  projectHasDocs,
  saveError,
  saveSolution,
  saveToolCalls,
  setSessionStatus,
} from '../services/sessionStore.js';

export const debugRouter = Router({ mergeParams: true });

const startSchema = z.object({
  errorText: z.string().min(1, 'errorText is required'),
  title: z.string().max(200).optional(),
});

/**
 * POST /api/projects/:projectId/debug
 * Starts an investigation and streams AgentEvents to the client over SSE.
 */
debugRouter.post('/debug', async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const projectId = req.params.projectId!;
  const { errorText } = parsed.data;
  const title = parsed.data.title || errorText.split('\n')[0]!.slice(0, 120);

  // Open the SSE stream.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const emit = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let sessionId: string | null = null;
  let runId: string | null = null;
  try {
    sessionId = await createSession(projectId, title);
    const repo = await getLatestRepository(projectId);
    const hasDocs = await projectHasDocs(projectId);

    const provider = getLlmProvider();
    runId = await createAgentRun(sessionId, provider.name, provider.model);

    emit({ type: 'status', message: 'Error parsed', level: 'success' });

    const result = await runInvestigation(
      { projectId, repoPath: repo?.localPath ?? undefined, errorText, hasDocs },
      emit,
      { provider },
    );

    await saveError(sessionId, errorText, result.errorType, result.technologies);
    await saveToolCalls(runId, result.toolCalls);
    await finishAgentRun(runId, 'completed', result.stepCount);
    await saveSolution(sessionId, result.diagnosis);
    await setSessionStatus(sessionId, 'completed');

    emit({ type: 'done', sessionId });
  } catch (err) {
    const message = (err as Error).message || 'Investigation failed';
    emit({ type: 'error', message });
    if (runId) await finishAgentRun(runId, 'failed', 0).catch(() => {});
    if (sessionId) await setSessionStatus(sessionId, 'failed').catch(() => {});
  } finally {
    res.end();
  }
});

/** GET /api/projects/:projectId/sessions — list past debugging sessions. */
debugRouter.get('/sessions', async (req, res) => {
  const sessions = await listSessions(req.params.projectId!);
  res.json(sessions);
});

/** GET /api/projects/:projectId/sessions/:sessionId — full session detail. */
debugRouter.get('/sessions/:sessionId', async (req, res) => {
  const detail = await getSessionDetail(req.params.sessionId!);
  if (!detail) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(detail);
});
