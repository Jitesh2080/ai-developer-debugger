import { withTransaction } from '../db/pool.js';
import { getLlmProvider } from '../llm/index.js';
import { chunkText } from './chunk.js';
import { toVectorLiteral } from './vector.js';

/**
 * Chunks a document's text, embeds each chunk, and stores the chunks with
 * their embeddings for later semantic retrieval. Returns the chunk count.
 */
export async function ingestDocument(params: {
  projectId: string;
  documentId: string;
  text: string;
}): Promise<number> {
  const { projectId, documentId, text } = params;
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const provider = getLlmProvider();
  const embeddings = await provider.embed(chunks.map((c) => c.content));

  await withTransaction(async (client) => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const embedding = embeddings[i]!;
      await client.query(
        `INSERT INTO document_chunks
           (document_id, project_id, chunk_index, content, token_count, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        [
          documentId,
          projectId,
          chunk.index,
          chunk.content,
          chunk.tokenCount,
          toVectorLiteral(embedding),
        ],
      );
    }
  });

  return chunks.length;
}
