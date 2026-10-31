import { Router } from 'express';
import multer from 'multer';
import type { DocumentMeta } from '@ai-debugger/shared';
import { query } from '../db/pool.js';
import { extractText, type DocumentSourceType } from '../rag/chunk.js';
import { ingestDocument } from '../rag/ingest.js';

// Mounted at /api/projects/:projectId/documents
export const documentsRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

function sourceTypeFor(filename: string): DocumentSourceType {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  return 'text';
}

documentsRouter.get('/', async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const { rows } = await query<{
    id: string;
    project_id: string;
    title: string;
    source_type: string;
    byte_size: number;
    created_at: string;
    chunk_count: string;
  }>(
    `SELECT d.id, d.project_id, d.title, d.source_type, d.byte_size, d.created_at,
            COUNT(dc.id)::text AS chunk_count
       FROM documents d
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
      WHERE d.project_id = $1
      GROUP BY d.id
      ORDER BY d.created_at DESC`,
    [projectId],
  );
  const docs: DocumentMeta[] = rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    sourceType: r.source_type,
    byteSize: r.byte_size,
    chunkCount: Number(r.chunk_count),
    createdAt: r.created_at,
  }));
  res.json(docs);
});

documentsRouter.post('/', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded (field name: "file").' });
    return;
  }
  const projectId = (req.params as { projectId: string }).projectId;
  const title = (req.body?.title as string) || file.originalname;
  const sourceType = sourceTypeFor(file.originalname);

  let text: string;
  try {
    text = await extractText(file.buffer, sourceType);
  } catch (err) {
    res
      .status(400)
      .json({ error: `Could not extract text: ${(err as Error).message}` });
    return;
  }

  const inserted = await query<{ id: string; created_at: string }>(
    `INSERT INTO documents (project_id, title, source_type, byte_size)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [projectId, title, sourceType, file.size],
  );
  const documentId = inserted.rows[0]!.id;

  let chunkCount = 0;
  try {
    chunkCount = await ingestDocument({ projectId, documentId, text });
  } catch (err) {
    await query(`DELETE FROM documents WHERE id = $1`, [documentId]);
    res
      .status(502)
      .json({ error: `Embedding failed: ${(err as Error).message}` });
    return;
  }

  const meta: DocumentMeta = {
    id: documentId,
    projectId,
    title,
    sourceType,
    byteSize: file.size,
    chunkCount,
    createdAt: inserted.rows[0]!.created_at,
  };
  res.status(201).json(meta);
});
