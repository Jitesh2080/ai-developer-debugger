import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';

describe('API', () => {
  it('exposes a health endpoint that reports the configured provider', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.provider).toBeDefined();
  });

  it('requires authentication for project routes', async () => {
    const app = createApp();
    // No Authorization header -> 401 before any DB/LLM work.
    const res = await request(app)
      .post('/api/projects/00000000-0000-0000-0000-000000000000/debug')
      .send({});
    expect(res.status).toBe(401);
  });

  it('rejects registration with a short password', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
  });
});
