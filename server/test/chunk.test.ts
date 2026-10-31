import { describe, expect, it } from 'vitest';
import { chunkText } from '../src/rag/chunk.js';

describe('chunkText', () => {
  it('returns no chunks for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('keeps small text as a single chunk', () => {
    const chunks = chunkText('Hello world.\n\nSecond paragraph.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toContain('Hello world.');
    expect(chunks[0]!.content).toContain('Second paragraph.');
    expect(chunks[0]!.index).toBe(0);
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
  });

  it('splits long text into multiple ordered chunks', () => {
    const para = 'word '.repeat(80).trim(); // ~400 chars
    const text = Array.from({ length: 8 }, () => para).join('\n\n');
    const chunks = chunkText(text, { maxChars: 500, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });

  it('hard-splits a single paragraph larger than maxChars', () => {
    const giant = 'x'.repeat(2500);
    const chunks = chunkText(giant, { maxChars: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(1000);
    }
  });
});
