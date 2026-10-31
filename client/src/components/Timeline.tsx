import { useMemo } from 'react';
import type { AgentEvent } from '@ai-debugger/shared';

interface ToolItem {
  kind: 'tool';
  id: string;
  server: string;
  tool: string;
  args: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  summary?: string;
  durationMs?: number;
}

interface TextItem {
  kind: 'text';
  variant: 'status' | 'error_parsed' | 'plan' | 'reasoning' | 'error' | 'done';
  title: string;
  detail?: string;
  level?: 'info' | 'success' | 'warn';
}

type Item = ToolItem | TextItem;

function buildItems(events: AgentEvent[]): Item[] {
  const items: Item[] = [];
  const toolIndex = new Map<string, number>();

  for (const ev of events) {
    switch (ev.type) {
      case 'status':
        items.push({
          kind: 'text',
          variant: 'status',
          title: ev.message,
          level: ev.level,
        });
        break;
      case 'error_parsed':
        items.push({
          kind: 'text',
          variant: 'error_parsed',
          title: `Error parsed: ${ev.errorType}`,
          detail: ev.technologies.length
            ? `Technologies: ${ev.technologies.join(', ')}`
            : undefined,
        });
        break;
      case 'plan':
        items.push({
          kind: 'text',
          variant: 'plan',
          title: 'Investigation plan',
          detail: ev.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        });
        break;
      case 'reasoning':
        items.push({
          kind: 'text',
          variant: 'reasoning',
          title: 'Reasoning',
          detail: ev.message,
        });
        break;
      case 'tool_call_start':
        toolIndex.set(ev.id, items.length);
        items.push({
          kind: 'tool',
          id: ev.id,
          server: ev.server,
          tool: ev.tool,
          args: ev.arguments,
          status: 'running',
        });
        break;
      case 'tool_call_result': {
        const idx = toolIndex.get(ev.id);
        if (idx !== undefined) {
          const existing = items[idx] as ToolItem;
          existing.status = ev.status === 'error' ? 'error' : 'success';
          existing.summary = ev.summary;
          existing.durationMs = ev.durationMs;
        }
        break;
      }
      case 'error':
        items.push({ kind: 'text', variant: 'error', title: ev.message });
        break;
      case 'done':
        items.push({
          kind: 'text',
          variant: 'done',
          title: 'Investigation complete',
          level: 'success',
        });
        break;
    }
  }
  return items;
}

function StatusIcon({ status }: { status: ToolItem['status'] }) {
  if (status === 'running')
    return <span className="animate-spin text-sky-400">⟳</span>;
  if (status === 'error') return <span className="text-rose-400">✗</span>;
  return <span className="text-emerald-400">✓</span>;
}

export function Timeline({ events }: { events: AgentEvent[] }) {
  const items = useMemo(() => buildItems(events), [events]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Waiting for the agent to begin…
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {items.map((item, i) =>
        item.kind === 'tool' ? (
          <li
            key={i}
            className="rounded-lg border border-ink-700 bg-ink-900/60 p-3"
          >
            <div className="flex items-center gap-2 text-sm">
              <StatusIcon status={item.status} />
              <span className="rounded bg-ink-700 px-1.5 py-0.5 text-xs text-slate-400">
                {item.server}
              </span>
              <span className="font-mono font-medium text-sky-300">
                {item.tool}
              </span>
              {item.durationMs !== undefined && (
                <span className="ml-auto text-xs text-slate-500">
                  {item.durationMs} ms
                </span>
              )}
            </div>
            <pre className="mt-2 overflow-x-auto rounded bg-ink-950 p-2 text-xs text-slate-400">
              {JSON.stringify(item.args)}
            </pre>
            {item.summary && (
              <p className="mt-2 text-sm text-slate-300">→ {item.summary}</p>
            )}
          </li>
        ) : (
          <li
            key={i}
            className={`flex gap-2 rounded-lg px-3 py-2 text-sm ${
              item.variant === 'error'
                ? 'bg-rose-500/10 text-rose-300'
                : 'text-slate-300'
            }`}
          >
            <span className="text-emerald-400">
              {item.variant === 'reasoning' ? '🧠' : '✓'}
            </span>
            <div>
              <div className="font-medium text-slate-200">{item.title}</div>
              {item.detail && (
                <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-400">
                  {item.detail}
                </pre>
              )}
            </div>
          </li>
        ),
      )}
    </ol>
  );
}
