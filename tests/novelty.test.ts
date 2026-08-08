import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JsonFileStore } from '../src/persistence/jsonFileStore.js';
import { MemoryService } from '../src/memory/memoryService.js';
import { NoveltyChecker } from '../src/memory/noveltyChecker.js';
import { DiscoveredTopic } from '../src/discovery/types.js';

describe('NoveltyChecker', () => {
  const testDir = path.resolve('./data-test-novelty');
  let store: JsonFileStore;
  let memory: MemoryService;
  let checker: NoveltyChecker;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    store = new JsonFileStore(testDir);
    memory = new MemoryService('local');
    checker = new NoveltyChecker(store, memory);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should pass novelty check for fresh topic', async () => {
    const topic: DiscoveredTopic = {
      id: 't-new-1',
      title: 'New Distributed Training Algorithm',
      summary: 'Summary of new training algorithm.',
      url: 'https://arxiv.org/abs/2408.99999',
      publishedAt: new Date().toISOString(),
      sourceName: 'arXiv cs.LG',
      sourceType: 'arxiv',
      discoveredAt: new Date().toISOString(),
    };

    const res = await checker.isTopicNovel(topic);
    expect(res.isDuplicate).toBe(false);
  });

  it('should detect duplicate topic by ID or URL in seen topics', async () => {
    const topic: DiscoveredTopic = {
      id: 't-seen-1',
      title: 'Previously Seen Topic',
      summary: 'Summary.',
      url: 'https://arxiv.org/abs/2408.88888',
      publishedAt: new Date().toISOString(),
      sourceName: 'arXiv cs.LG',
      sourceType: 'arxiv',
      discoveredAt: new Date().toISOString(),
    };

    await store.markTopicSeen(topic.id);
    const res = await checker.isTopicNovel(topic);
    expect(res.isDuplicate).toBe(true);
    expect(res.reason).toContain('Topic ID');
  });

  it('should detect duplicate source URL in previously published posts', async () => {
    await store.addPost({
      id: 'post-100',
      createdAt: new Date().toISOString(),
      text: 'Existing post on LLM inference',
      rationale: 'High signal',
      sources: ['https://github.com/vllm-project/vllm/releases/tag/v0.6.0'],
    });

    const topic: DiscoveredTopic = {
      id: 't-url-dup',
      title: 'vLLM Release v0.6.0 Announcement',
      summary: 'New release details.',
      url: 'https://github.com/vllm-project/vllm/releases/tag/v0.6.0',
      publishedAt: new Date().toISOString(),
      sourceName: 'vLLM Releases',
      sourceType: 'github_release',
      discoveredAt: new Date().toISOString(),
    };

    const res = await checker.isTopicNovel(topic);
    expect(res.isDuplicate).toBe(true);
    expect(res.reason).toContain('Source URL');
  });
});
