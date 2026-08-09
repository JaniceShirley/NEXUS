import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { JsonFileStore } from '../src/persistence/jsonFileStore.js';
import { MemoryService } from '../src/memory/memoryService.js';
import { NexusAgentService } from '../src/agent/agentService.js';
import { SchedulerService } from '../src/scheduler/schedulerService.js';
import { createApp } from '../src/api/app.js';

describe('API Contract Endpoints & Hardening', () => {
  const testDir = path.resolve('./data-test-api-hardening');
  let store: JsonFileStore;
  let memory: MemoryService;
  let agentService: NexusAgentService;
  let schedulerService: SchedulerService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    store = new JsonFileStore(testDir);
    memory = new MemoryService('local');
    agentService = new NexusAgentService({ store, memory });
    schedulerService = new SchedulerService(agentService, 60);
    app = createApp(agentService, schedulerService, store, memory, { name: 'mock' } as any);
  });

  afterEach(() => {
    schedulerService.stop();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('POST /api/agent/init should return agentId and activate scheduler', async () => {
    const res = await request(app)
      .post('/api/agent/init')
      .send({
        persona: {
          name: 'NEXUS',
          domain: 'AI Engineering',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.agentId).toBeDefined();
    expect(typeof res.body.agentId).toBe('string');
    expect(schedulerService.isTimerActive()).toBe(true);
  });

  it('POST /api/agent/init called repeatedly should return the SAME agentId without duplicate state', async () => {
    const res1 = await request(app)
      .post('/api/agent/init')
      .send({ persona: { name: 'NEXUS', domain: 'AI Engineering' } });

    const agentId1 = res1.body.agentId;

    const res2 = await request(app)
      .post('/api/agent/init')
      .send({ persona: { name: 'NEXUS', domain: 'AI Engineering' } });

    const agentId2 = res2.body.agentId;

    expect(agentId1).toBe(agentId2);
  });

  it('GET /api/agent/feed should return empty posts array when no posts exist', async () => {
    const initRes = await request(app).post('/api/agent/init').send();
    const agentId = initRes.body.agentId;

    const res = await request(app).get(`/api/agent/feed?agentId=${agentId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ posts: [] });
  });

  it('GET /api/agent/feed should return posts in newest-first order with valid ISO 8601 UTC timestamps and verified URLs', async () => {
    const post1 = {
      id: 'p1',
      createdAt: '2026-08-08T10:00:00.000Z',
      text: 'Post 1: LLM Inference optimization',
      rationale: 'High signal research paper on speculative decoding.',
      sources: ['https://arxiv.org/abs/2408.00001'],
    };
    const post2 = {
      id: 'p2',
      createdAt: '2026-08-08T12:00:00.000Z',
      text: 'Post 2: Vector DB benchmarking',
      rationale: 'Critical evaluation of index latency under load.',
      sources: ['https://github.com/vllm-project/vllm/releases/tag/v0.6.0'],
    };

    await store.addPost(post1);
    await store.addPost(post2);

    const initRes = await request(app).post('/api/agent/init').send();
    const agentId = initRes.body.agentId;

    const res = await request(app).get(`/api/agent/feed?agentId=${agentId}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.length).toBe(2);
    // Newest first
    expect(res.body.posts[0].id).toBe('p2');
    expect(res.body.posts[1].id).toBe('p1');

    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    expect(res.body.posts[0].createdAt).toMatch(isoRegex);
    expect(res.body.posts[1].createdAt).toMatch(isoRegex);

    expect(res.body.posts[0].sources[0]).toMatch(/^https?:\/\//);
    expect(res.body.posts[1].sources[0]).toMatch(/^https?:\/\//);
  });

  it('GET /api/agent/feed should return 400 if agentId query parameter is missing', async () => {
    await request(app).post('/api/agent/init').send();
    const res = await request(app).get('/api/agent/feed');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing agentId query parameter.');
  });

  it('GET /api/agent/feed should return 403 if agentId is invalid', async () => {
    await request(app).post('/api/agent/init').send();
    const res = await request(app).get('/api/agent/feed?agentId=wrong-id');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Invalid agentId.');
  });

  it('GET /api/agent/feed should return 400 if agent is not initialized', async () => {
    const res = await request(app).get('/api/agent/feed?agentId=abc-123');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Agent is not initialized yet. Call /api/agent/init first.');
  });
});
