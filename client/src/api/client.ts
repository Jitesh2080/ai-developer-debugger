import type {
  AgentEvent,
  DebugSessionDetail,
  DebugSessionSummary,
  DocumentMeta,
  Project,
  Repository,
} from '@ai-debugger/shared';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:4000';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => json<Project[]>('/api/projects'),
  createProject: (name: string, description?: string) =>
    json<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  getProject: (id: string) => json<Project>(`/api/projects/${id}`),

  listRepositories: (projectId: string) =>
    json<Repository[]>(`/api/projects/${projectId}/repositories`),
  connectRepository: (projectId: string, url: string, defaultBranch?: string) =>
    json<Repository>(`/api/projects/${projectId}/repositories`, {
      method: 'POST',
      body: JSON.stringify({ url, defaultBranch }),
    }),

  listDocuments: (projectId: string) =>
    json<DocumentMeta[]>(`/api/projects/${projectId}/documents`),
  uploadDocument: async (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/documents`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return (await res.json()) as DocumentMeta;
  },

  listSessions: (projectId: string) =>
    json<DebugSessionSummary[]>(`/api/projects/${projectId}/sessions`),
  getSession: (projectId: string, sessionId: string) =>
    json<DebugSessionDetail>(
      `/api/projects/${projectId}/sessions/${sessionId}`,
    ),
};

/**
 * Starts an investigation and consumes the Server-Sent Events stream, invoking
 * `onEvent` for each AgentEvent. Uses fetch streaming because the endpoint is a
 * POST (EventSource only supports GET).
 */
export async function streamInvestigation(
  projectId: string,
  errorText: string,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/projects/${projectId}/debug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ errorText }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame
        .split('\n')
        .find((l) => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice('data:'.length).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload) as AgentEvent);
      } catch {
        // Ignore malformed frames.
      }
    }
  }
}
