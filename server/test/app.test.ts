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

  it('validates the investigation request body', async () => {
    const app = createApp();
    // Missing errorText -> 400 before any DB/LLM work.
    const res = await request(app)
      .post('/api/projects/00000000-0000-0000-0000-000000000000/debug')
      .send({});
    expect(res.status).toBe(400);
  });
});
