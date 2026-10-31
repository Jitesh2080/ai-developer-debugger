export type DocumentSourceType = 'markdown' | 'text' | 'pdf';

export interface Chunk {
  index: number;
  content: string;
  tokenCount: number;
}

/** Rough token estimate (~4 chars/token) good enough for budgeting. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extracts plain text from an uploaded document buffer. Markdown and text are
 * returned as-is; PDFs are parsed. (pdf-parse is loaded from its lib entry to
 * avoid the package's debug harness that runs on direct `require`.)
 */
export async function extractText(
  buffer: Buffer,
  sourceType: DocumentSourceType,
): Promise<string> {
  if (sourceType === 'pdf') {
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }
  return buffer.toString('utf8');
}

/**
 * Splits text into overlapping chunks, preferring paragraph boundaries so a
 * chunk rarely cuts a sentence in half. Overlap preserves context across the
 * boundary for better retrieval.
 */
export function chunkText(
  text: string,
  opts: { maxChars?: number; overlap?: number } = {},
): Chunk[] {
  const maxChars = opts.maxChars ?? 1000;
  const overlap = opts.overlap ?? 150;

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\s*\n/);
  const chunks: Chunk[] = [];
  let buffer = '';

  const flush = () => {
    const content = buffer.trim();
    if (content) {
      chunks.push({
        index: chunks.length,
        content,
        tokenCount: estimateTokens(content),
      });
    }
  };

  for (const para of paragraphs) {
    const piece = para.trim();
    if (!piece) continue;

    if (buffer.length + piece.length + 2 <= maxChars) {
      buffer = buffer ? `${buffer}\n\n${piece}` : piece;
      continue;
    }

    // Current buffer is full: flush it, then start a new one with overlap.
    if (buffer) {
      flush();
      buffer = overlap > 0 ? buffer.slice(-overlap) : '';
    }

    if (piece.length <= maxChars) {
      buffer = buffer ? `${buffer}\n\n${piece}` : piece;
    } else {
      // A single paragraph larger than maxChars: hard-split it.
      for (let i = 0; i < piece.length; i += maxChars - overlap) {
        const slice = piece.slice(i, i + maxChars);
        chunks.push({
          index: chunks.length,
          content: slice,
          tokenCount: estimateTokens(slice),
        });
      }
      buffer = '';
    }
  }
  flush();

  return chunks;
}
