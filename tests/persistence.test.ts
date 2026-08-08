import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JsonFileStore } from '../src/persistence/jsonFileStore.js';

describe('JsonFileStore', () => {
  const testDir = path.resolve('./data-test-persistence');

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

  it('should initialize with default uninitialized state and empty posts', async () => {
    const store = new JsonFileStore(testDir);
    const state = await store.getAgentState();
    const posts = await store.getPosts();

    expect(state.initialized).toBe(false);
    expect(state.agentId).toBeNull();
    expect(posts).toEqual([]);
  });

  it('should persist and retrieve agent state correctly', async () => {
    const store = new JsonFileStore(testDir);
    await store.setAgentState({
      initialized: true,
      agentId: 'test-agent-123',
      persona: { name: 'NEXUS', domain: 'AI Engineering' },
      initializedAt: '2026-08-08T10:00:00.000Z',
      lastRunAt: null,
    });

    // Re-instantiate store from same directory to test file persistence
    const store2 = new JsonFileStore(testDir);
    const state = await store2.getAgentState();

    expect(state.initialized).toBe(true);
    expect(state.agentId).toBe('test-agent-123');
    expect(state.persona?.name).toBe('NEXUS');
  });

  it('should add posts and return them in newest-first order', async () => {
    const store = new JsonFileStore(testDir);
    const post1 = {
      id: 'p1',
      createdAt: '2026-08-08T10:00:00.000Z',
      text: 'First post content',
      rationale: 'Reason 1',
      sources: ['https://source1.com'],
    };
    const post2 = {
      id: 'p2',
      createdAt: '2026-08-08T11:00:00.000Z',
      text: 'Second post content',
      rationale: 'Reason 2',
      sources: ['https://source2.com'],
    };

    await store.addPost(post1);
    await store.addPost(post2);

    const posts = await store.getPosts();
    expect(posts.length).toBe(2);
    expect(posts[0].id).toBe('p2'); // Newer post first
    expect(posts[1].id).toBe('p1');
  });

  it('should track seen topics correctly', async () => {
    const store = new JsonFileStore(testDir);
    expect(await store.hasSeenTopic('topic-1')).toBe(false);

    await store.markTopicSeen('topic-1');
    expect(await store.hasSeenTopic('topic-1')).toBe(true);
  });
});
