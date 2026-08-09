import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { JsonFileStore } from '../src/persistence/jsonFileStore.js';
import { MemoryService } from '../src/memory/memoryService.js';
import { NexusAgentService } from '../src/agent/agentService.js';
import { SchedulerService } from '../src/scheduler/schedulerService.js';
import { MockLlmProvider } from '../src/generation/providers/mockLlmProvider.js';
import { createApp } from '../src/api/app.js';

describe('Production Autonomy & Resilience', () => {
  const testDir = path.resolve('./data-test-autonomy');
  let store: JsonFileStore;
  let memory: MemoryService;
  let agentService: NexusAgentService;
  let schedulerService: SchedulerService;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    store = new JsonFileStore(testDir);
    memory = new MemoryService('local');
    agentService = new NexusAgentService({ store, memory });
    schedulerService = new SchedulerService(agentService, 60);
  });

  afterEach(() => {
    schedulerService.stop();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should maintain a singleton scheduler and prevent duplicate timers on repeated start/init', async () => {
    expect(schedulerService.isTimerActive()).toBe(false);

    schedulerService.start();
    expect(schedulerService.isTimerActive()).toBe(true);

    // Call start second time -> timer remains single instance
    schedulerService.start();
    expect(schedulerService.isTimerActive()).toBe(true);

    schedulerService.stop();
    expect(schedulerService.isTimerActive()).toBe(false);
  });

  it('should auto-resume autonomy upon server restart when state was previously initialized', async () => {
    // 1. Initialize agent
    await agentService.initialize({ name: 'NEXUS', domain: 'AI Engineering' });
    const state1 = await store.getAgentState();
    expect(state1.initialized).toBe(true);

    // 2. Simulate server reboot: instantiate fresh store & scheduler from same directory
    const freshStore = new JsonFileStore(testDir);
    const freshMemory = new MemoryService('local');
    const freshAgentService = new NexusAgentService({ store: freshStore, memory: freshMemory });
    const freshSchedulerService = new SchedulerService(freshAgentService, 60);

    expect(freshSchedulerService.isTimerActive()).toBe(false);

    // 3. Server boot invokes checkAndAutoStart()
    const resumed = await freshSchedulerService.checkAndAutoStart();
    expect(resumed).toBe(true);
    expect(freshSchedulerService.isTimerActive()).toBe(true);

    freshSchedulerService.stop();
  });

  it('should prevent concurrent tick execution via process-level lock', async () => {
    await agentService.initialize({ name: 'NEXUS', domain: 'AI Engineering' });

    // Mock long-running runAutonomousCycle
    vi.spyOn(agentService, 'runAutonomousCycle').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ status: 'completed' } as any), 100))
    );

    // Fire two ticks concurrently
    const tick1Promise = schedulerService.tick();
    const tick2Promise = schedulerService.tick();

    const [res1, res2] = await Promise.all([tick1Promise, tick2Promise]);

    expect(res1.status === 'busy' || res2.status === 'busy').toBe(true);
    const busyRes = res1.status === 'busy' ? res1 : res2;
    expect(busyRes.reason).toContain('Previous cycle still running');
  });

  it('should recover gracefully from a failed tick without killing the scheduler timer', async () => {
    await agentService.initialize({ name: 'NEXUS', domain: 'AI Engineering' });
    schedulerService.start();

    // Mock failing runAutonomousCycle
    vi.spyOn(agentService, 'runAutonomousCycle').mockRejectedValueOnce(new Error('Transient API failure'));

    const tickRes = await schedulerService.tick();
    expect(tickRes.status).toBe('error');
    expect(tickRes.reason).toContain('Transient API failure');

    // Timer remains active for future cycles!
    expect(schedulerService.isTimerActive()).toBe(true);
  });

  it('GET /api/agent/feed should read from persistence without triggering post generation', async () => {
    await agentService.initialize({ name: 'NEXUS', domain: 'AI Engineering' });
    const spyCycle = vi.spyOn(agentService, 'runAutonomousCycle');

    const mockLlm = new MockLlmProvider();
    const app = createApp(agentService, schedulerService, store, memory, mockLlm);

    const initRes = await request(app).post('/api/agent/init').send();
    const res = await request(app).get(`/api/agent/feed?agentId=${initRes.body.agentId}`);

    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual([]);
    expect(spyCycle).not.toHaveBeenCalled();
  });

  it('GET /api/health should report diagnostic metrics without exposing secrets', async () => {
    await agentService.initialize({ name: 'NEXUS', domain: 'AI Engineering' });
    schedulerService.start();

    const mockLlm = new MockLlmProvider();
    const app = createApp(agentService, schedulerService, store, memory, mockLlm);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.initialized).toBe(true);
    expect(res.body.schedulerActive).toBe(true);
    expect(res.body.memoryProvider).toBe('local');
    expect(res.body.llmProvider).toBe('mock');
    expect(res.body.timestamp).toBeDefined();

    // Ensure no credentials in response body
    const responseString = JSON.stringify(res.body);
    expect(responseString).not.toContain('API_KEY');
    expect(responseString).not.toContain('Bearer');
  });
});
