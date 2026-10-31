import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { closePool, query } from '../../../db/pool.js';
import { semanticSearch } from '../../../rag/retrieve.js';

/**
 * Documentation MCP server — retrieves relevant project documentation via
 * semantic (pgvector) search. Scoped to a single project via PROJECT_ID.
 * Exposed over stdio.
 */
const server = new McpServer({ name: 'docs-mcp', version: '0.1.0' });

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

function projectId(): string {
  const id = process.env.PROJECT_ID;
  if (!id) throw new Error('PROJECT_ID is not set for the docs MCP server.');
  return id;
}

server.tool(
  'search_docs',
  'Semantic search over the project documentation. Returns the most relevant chunks with their source document and similarity score.',
  {
    query: z.string(),
    k: z.number().int().positive().max(10).optional(),
  },
  async ({ query: q, k = 5 }) => {
    const results = await semanticSearch(projectId(), q, k);
    if (results.length === 0) {
      return text('No documentation found for this query.');
    }
    const formatted = results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.documentTitle} (chunk ${r.chunkIndex}, score ${r.score.toFixed(
            3,
          )})\n${r.content}`,
      )
      .join('\n\n---\n\n');
    return text(formatted);
  },
);

server.tool(
  'get_document',
  'Retrieve the full text of a single document by its id (chunks reassembled in order).',
  { documentId: z.string() },
  async ({ documentId }) => {
    const { rows } = await query<{ title: string; content: string }>(
      `SELECT d.title, dc.content
         FROM document_chunks dc
         JOIN documents d ON d.id = dc.document_id
        WHERE dc.document_id = $1 AND dc.project_id = $2
        ORDER BY dc.chunk_index ASC`,
      [documentId, projectId()],
    );
    if (rows.length === 0) return text(`No document found with id ${documentId}.`);
    const title = rows[0]!.title;
    const body = rows.map((r) => r.content).join('\n\n');
    return text(`# ${title}\n\n${body}`);
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('[docs-mcp] fatal', err);
  closePool().finally(() => process.exit(1));
});
