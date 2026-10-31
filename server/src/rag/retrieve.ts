import { query } from '../db/pool.js';
import { getLlmProvider } from '../llm/index.js';
import { toVectorLiteral } from './vector.js';

export interface RetrievedChunk {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  /** Cosine similarity in [0,1]; higher is more relevant. */
  score: number;
}

interface Row {
  document_id: string;
  title: string;
  chunk_index: number;
  content: string;
  score: string; // numeric comes back as string from pg
}

/**
 * Embeds the query and returns the top-k most similar document chunks for a
 * project using pgvector cosine distance.
 */
export async function semanticSearch(
  projectId: string,
  queryText: string,
  k = 5,
): Promise<RetrievedChunk[]> {
  const provider = getLlmProvider();
  const [embedding] = await provider.embed([queryText]);
  if (!embedding) return [];

  const { rows } = await query<Row>(
    `SELECT dc.document_id,
            d.title,
            dc.chunk_index,
            dc.content,
            1 - (dc.embedding <=> $1::vector) AS score
       FROM document_chunks dc
       JOIN documents d ON d.id = dc.document_id
      WHERE dc.project_id = $2
        AND dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $3`,
    [toVectorLiteral(embedding), projectId, k],
  );

  return rows.map((r) => ({
    documentId: r.document_id,
    documentTitle: r.title,
    chunkIndex: r.chunk_index,
    content: r.content,
    score: Number(r.score),
  }));
}
