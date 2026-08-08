import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JsonFileStore } from '../src/persistence/jsonFileStore.js';
import { MemoryService } from '../src/memory/memoryService.js';
import { NexusAgentService } from '../src/agent/agentService.js';
import { SchedulerService } from '../src/scheduler/schedulerService.js';

describe('SchedulerService', () => {
  const testDir = path.resolve('./data-test-scheduler');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should not auto-start if agent is uninitialized', async () => {
    const store = new JsonFileStore(testDir);
    const memory = new MemoryService('local');
    const agent = new NexusAgentService({ store, memory });
    const scheduler = new SchedulerService(agent, 60);

    const started = await scheduler.checkAndAutoStart();
    expect(started).toBe(false);
    expect(scheduler.isTimerActive()).toBe(false);
  });

  it('should auto-start if agent is initialized', async () => {
    const store = new JsonFileStore(testDir);
    const memory = new MemoryService('local');
    const agent = new NexusAgentService({ store, memory });
    await agent.initialize({ name: 'NEXUS', domain: 'AI Engineering' });

    const scheduler = new SchedulerService(agent, 60);
    const started = await scheduler.checkAndAutoStart();

    expect(started).toBe(true);
    expect(scheduler.isTimerActive()).toBe(true);

    scheduler.stop();
    expect(scheduler.isTimerActive()).toBe(false);
  });

  it('should execute tick successfully', async () => {
    const store = new JsonFileStore(testDir);
    const memory = new MemoryService('local');
    const agent = new NexusAgentService({ store, memory });
    await agent.initialize({ name: 'NEXUS', domain: 'AI Engineering' });

    const scheduler = new SchedulerService(agent, 60);
    const result = await scheduler.tick();

    expect(result.status).toBeDefined();
  });
});
