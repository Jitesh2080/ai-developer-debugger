import type {
  AgentEvent,
  DebugSessionDetail,
  DebugSessionSummary,
  DocumentMeta,
  FixProposal,
  Project,
  ProjectStats,
  Repository,
} from '@ai-debugger/shared';
import { clearToken, getToken } from '../auth/token';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:4000';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** On an expired/invalid session, drop the token and bounce to login. */
function handleUnauthorized() {
  clearToken();
  if (!location.pathname.startsWith('/login')) {
    location.href = '/login';
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const authApi = {
  register: (email: string, password: string, name?: string) =>
    json<{ token: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    json<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => json<{ user: AuthUser }>('/api/auth/me'),
  config: () => json<{ googleEnabled: boolean }>('/api/auth/config'),
  googleUrl: () => `${BASE_URL}/api/auth/google`,
};

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
      headers: authHeaders(),
      body: form,
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error('Session expired. Please sign in again.');
    }
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return (await res.json()) as DocumentMeta;
  },

  listSessions: (projectId: string) =>
    json<DebugSessionSummary[]>(`/api/projects/${projectId}/sessions`),
  getStats: (projectId: string) =>
    json<ProjectStats>(`/api/projects/${projectId}/stats`),
  getSession: (projectId: string, sessionId: string) =>
    json<DebugSessionDetail>(
      `/api/projects/${projectId}/sessions/${sessionId}`,
    ),

  proposeFix: (projectId: string, sessionId: string) =>
    json<FixProposal>(
      `/api/projects/${projectId}/sessions/${sessionId}/propose-fix`,
      { method: 'POST' },
    ),
  listProposals: (projectId: string, sessionId: string) =>
    json<FixProposal[]>(
      `/api/projects/${projectId}/sessions/${sessionId}/proposals`,
    ),
  approveProposal: (projectId: string, proposalId: string) =>
    json<{ proposal: FixProposal; writesEnabled: boolean }>(
      `/api/projects/${projectId}/proposals/${proposalId}/approve`,
      { method: 'POST' },
    ),
  rejectProposal: (projectId: string, proposalId: string) =>
    json<{ proposal: FixProposal }>(
      `/api/projects/${projectId}/proposals/${proposalId}/reject`,
      { method: 'POST' },
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
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
