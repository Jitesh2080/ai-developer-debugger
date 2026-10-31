import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFileSlice, safeResolve } from '../src/mcp/servers/github/repo.js';

describe('safeResolve', () => {
  const root = '/tmp/repo';

  it('resolves paths inside the repo', () => {
    expect(safeResolve(root, 'src/index.ts')).toBe('/tmp/repo/src/index.ts');
  });

  it('rejects path traversal outside the repo', () => {
    expect(() => safeResolve(root, '../etc/passwd')).toThrow(/escapes/);
    expect(() => safeResolve(root, '../../secret')).toThrow(/escapes/);
  });
});

describe('readFileSlice', () => {
  it('returns the whole file when no range given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repo-'));
    const file = join(dir, 'a.txt');
    await writeFile(file, 'line1\nline2\nline3\n');
    const out = await readFileSlice(file);
    expect(out).toBe('line1\nline2\nline3\n');
  });

  it('returns a numbered line range', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repo-'));
    const file = join(dir, 'b.txt');
    await writeFile(file, 'a\nb\nc\nd\ne');
    const out = await readFileSlice(file, 2, 4);
    expect(out).toBe('2: b\n3: c\n4: d');
  });
});
