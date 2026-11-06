import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { FixProposal } from '@ai-debugger/shared';
import { query } from '../db/pool.js';
import { getLlmProvider } from '../llm/index.js';
import { getSessionDetail, getLatestRepository } from './sessionStore.js';

interface ProposalRow {
  id: string;
  debug_session_id: string;
  file_path: string;
  original_content: string;
  proposed_content: string;
  explanation: string;
  status: FixProposal['status'];
  created_at: string;
  resolved_at: string | null;
}

const mapProposal = (r: ProposalRow): FixProposal => ({
  id: r.id,
  debugSessionId: r.debug_session_id,
  filePath: r.file_path,
  originalContent: r.original_content,
  proposedContent: r.proposed_content,
  explanation: r.explanation,
  status: r.status,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
});

/** Resolve a repo-relative path and refuse anything escaping the repo root. */
function safeJoin(root: string, rel: string): string {
  const abs = resolve(root, rel);
  const r = relative(root, abs);
  if (r.startsWith('..') || isAbsolute(r)) {
    throw new Error(`Path escapes repository: ${rel}`);
  }
  return abs;
}

/**
 * Generates a fix proposal for a completed session: reads the first affected
 * file from the repo clone, asks the LLM for a corrected version, and stores it
 * as a PENDING proposal (nothing is written to disk here).
 */
export async function generateProposal(
  projectId: string,
  sessionId: string,
): Promise<FixProposal> {
  const session = await getSessionDetail(sessionId);
  if (!session || !session.solution) {
    throw new Error('Session has no diagnosis to base a fix on.');
  }
  const repo = await getLatestRepository(projectId);
  if (!repo?.localPath) {
    throw new Error('No cloned repository is connected to this project.');
  }

  // Pick the first affected file that actually exists in the clone.
  let targetRel: string | null = null;
  let original = '';
  for (const candidate of session.solution.affectedFiles) {
    try {
      const abs = safeJoin(repo.localPath, candidate);
      original = await readFile(abs, 'utf8');
      targetRel = candidate;
      break;
    } catch {
      // try the next candidate
    }
  }
  if (!targetRel) {
    throw new Error(
      'None of the affected files could be read from the repository clone.',
    );
  }

  const provider = getLlmProvider();
  const prompt = `You are fixing a bug. Based on the diagnosis, return a corrected version of the ENTIRE file.

ROOT CAUSE:
${session.solution.rootCause}

SUGGESTED FIX:
${session.solution.suggestedFix}

FILE: ${targetRel}
---CURRENT CONTENT---
${original.slice(0, 20000)}
---END---

Respond ONLY with JSON: { "proposedContent": "<the full corrected file content>", "explanation": "<one or two sentences on what you changed>" }`;

  const res = await provider.chatWithTools(
    [
      {
        role: 'system',
        content:
          'You produce minimal, correct code fixes. Return the complete file, not a diff.',
      },
      { role: 'user', content: prompt },
    ],
    [],
    { responseFormatJson: true },
  );

  let proposedContent = original;
  let explanation = 'No changes proposed.';
  try {
    const parsed = JSON.parse(res.content) as {
      proposedContent?: string;
      explanation?: string;
    };
    if (parsed.proposedContent) proposedContent = parsed.proposedContent;
    if (parsed.explanation) explanation = parsed.explanation;
  } catch {
    explanation = 'The model did not return a parseable fix.';
  }

  const { rows } = await query<ProposalRow>(
    `INSERT INTO fix_proposals
       (debug_session_id, file_path, original_content, proposed_content, explanation)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [sessionId, targetRel, original, proposedContent, explanation],
  );
  return mapProposal(rows[0]!);
}

export async function listProposals(sessionId: string): Promise<FixProposal[]> {
  const { rows } = await query<ProposalRow>(
    `SELECT * FROM fix_proposals WHERE debug_session_id = $1 ORDER BY created_at DESC`,
    [sessionId],
  );
  return rows.map(mapProposal);
}

/**
 * Approves or rejects a proposal. On approval, the change is written to the
 * local clone ONLY if write actions are enabled; otherwise it is marked
 * approved but not applied (read-only safety).
 */
export async function resolveProposal(params: {
  projectId: string;
  proposalId: string;
  action: 'approve' | 'reject';
  writeEnabled: boolean;
}): Promise<FixProposal> {
  const { rows } = await query<ProposalRow>(
    `SELECT * FROM fix_proposals WHERE id = $1`,
    [params.proposalId],
  );
  const proposal = rows[0];
  if (!proposal) throw new Error('Proposal not found.');
  if (proposal.status !== 'pending') {
    throw new Error(`Proposal is already ${proposal.status}.`);
  }

  if (params.action === 'reject') {
    const r = await query<ProposalRow>(
      `UPDATE fix_proposals SET status='rejected', resolved_at=now() WHERE id=$1 RETURNING *`,
      [params.proposalId],
    );
    return mapProposal(r.rows[0]!);
  }

  // Approve
  let status: FixProposal['status'] = 'approved';
  if (params.writeEnabled) {
    const repo = await getLatestRepository(params.projectId);
    if (!repo?.localPath) throw new Error('No repository clone to write to.');
    const abs = safeJoin(repo.localPath, proposal.file_path);
    await writeFile(abs, proposal.proposed_content, 'utf8');
    status = 'applied';
  }
  const r = await query<ProposalRow>(
    `UPDATE fix_proposals SET status=$2, resolved_at=now() WHERE id=$1 RETURNING *`,
    [params.proposalId, status],
  );
  return mapProposal(r.rows[0]!);
}
