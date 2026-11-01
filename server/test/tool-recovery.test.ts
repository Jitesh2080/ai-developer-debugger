import { describe, expect, it } from 'vitest';
import { recoverToolCallsFromText } from '../src/llm/openai.js';

const TOOLS = new Set(['search_code', 'get_file']);

describe('recoverToolCallsFromText', () => {
  it('recovers a tool call emitted as pure JSON', () => {
    const calls = recoverToolCallsFromText(
      '{"name":"search_code","arguments":{"query":"handle"}}',
      TOOLS,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('search_code');
    expect(JSON.parse(calls[0]!.arguments)).toEqual({ query: 'handle' });
  });

  it('recovers a tool call embedded in surrounding prose', () => {
    const content =
      "Let's start by searching the codebase.\n\n" +
      '{"name": "search_code", "arguments": {"query": "length", "ignoreCase": true}}';
    const calls = recoverToolCallsFromText(content, TOOLS);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('search_code');
    expect(JSON.parse(calls[0]!.arguments)).toEqual({
      query: 'length',
      ignoreCase: true,
    });
  });

  it('ignores JSON whose name is not a known tool (e.g. a final diagnosis)', () => {
    const diagnosis =
      '{"rootCause":"something","confidence":80,"suggestedFix":"fix it"}';
    expect(recoverToolCallsFromText(diagnosis, TOOLS)).toEqual([]);
  });

  it('respects braces inside string values', () => {
    const content =
      '{"name":"search_code","arguments":{"query":"const x = {a: 1}"}}';
    const calls = recoverToolCallsFromText(content, TOOLS);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!.arguments).query).toBe('const x = {a: 1}');
  });

  it('returns nothing when there is no JSON', () => {
    expect(recoverToolCallsFromText('just prose, no call', TOOLS)).toEqual([]);
  });
});
