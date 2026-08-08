import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JsonFileStore } from '../src/persistence/jsonFileStore.js';
import { MemoryService } from '../src/memory/memoryService.js';
import { NexusAgentService } from '../src/agent/agentService.js';
import { LiveTopicDiscoveryService } from '../src/discovery/topicDiscoveryService.js';
import { NexusEditorialJudge } from '../src/editorial/editorialJudge.js';
import { NexusContentGenerator } from '../src/generation/contentGenerator.js';
import { MockLlmProvider } from '../src/generation/providers/mockLlmProvider.js';
import { DiscoveredTopic } from '../src/discovery/types.js';

describe('End-to-End Autonomous Intelligence Tick Flow', () => {
  const testDir = path.resolve('./data-test-autonomous');
  let store: JsonFileStore;
  let memory: MemoryService;
  let discovery: LiveTopicDiscoveryService;
  let judge: NexusEditorialJudge;
  let generator: NexusContentGenerator;
  let agentService: NexusAgentService;

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    store = new JsonFileStore(testDir);
    memory = new MemoryService('local');
    judge = new NexusEditorialJudge(0.65);
    generator = new NexusContentGenerator(new MockLlmProvider());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return status not_initialized if agent has not been initialized', async () => {
    discovery = new LiveTopicDiscoveryService();
    agentService = new NexusAgentService({ store, memory, discovery, judge, generator });

    const result = await agentService.runAutonomousCycle();
    expect(result.status).toBe('not_initialized');
    expect(result.discoveredCount).toBe(0);
  });

  it('should execute complete autonomous tick: discover -> evaluate -> generate -> persist post', async () => {
    const mockTopics: DiscoveredTopic[] = [
      {
        id: 't-tick-1',
        title: 'Speculative Decoding for Distributed LLM Runtimes',
        summary: 'Technical evaluation of KV cache bandwidth and speculative verification in multi-GPU clusters.',
        url: 'https://arxiv.org/abs/2408.12345',
        publishedAt: new Date().toISOString(),
        sourceName: 'arXiv cs.AI',
        sourceType: 'arxiv',
        discoveredAt: new Date().toISOString(),
      },
    ];

    const mockDiscovery = {
      discoverTopics: vi.fn().mockResolvedValue(mockTopics),
    };

    agentService = new NexusAgentService({
      store,
      memory,
      discovery: mockDiscovery as any,
      judge,
      generator,
    });

    await agentService.initialize({ name: 'NEXUS', domain: 'AI Engineering' });

    const result = await agentService.runAutonomousCycle();

    expect(result.status).toBe('published');
    expect(result.discoveredCount).toBe(1);
    expect(result.acceptedCount).toBe(1);
    expect(result.publishedPostId).toBeDefined();
    expect(result.publishedPost).toBeDefined();
    expect(result.publishedPost?.sources).toContain('https://arxiv.org/abs/2408.12345');

    // Verify post is persisted and retrievable via getFeed
    const feed = await agentService.getFeed();
    expect(feed.posts.length).toBe(1);
    expect(feed.posts[0].id).toBe(result.publishedPostId);
  });

  it('should reject low-signal candidate and generate zero posts', async () => {
    const mockTopics: DiscoveredTopic[] = [
      {
        id: 't-tick-hype',
        title: 'Company Y Launches New Teaser Waitlist App',
        summary: 'Promotional teaser with no technical benchmark.',
        url: 'https://hypeblog.com/teaser',
        publishedAt: new Date().toISOString(),
        sourceName: 'Hype Feed',
        sourceType: 'rss',
        discoveredAt: new Date().toISOString(),
      },
    ];

    const mockDiscovery = {
      discoverTopics: vi.fn().mockResolvedValue(mockTopics),
    };

    agentService = new NexusAgentService({
      store,
      memory,
      discovery: mockDiscovery as any,
      judge,
      generator,
    });

    await agentService.initialize({ name: 'NEXUS', domain: 'AI Engineering' });

    const result = await agentService.runAutonomousCycle();

    expect(result.status).toBe('all_rejected');
    expect(result.rejectedCount).toBe(1);
    expect(result.rejections?.length).toBe(1);

    const feed = await agentService.getFeed();
    expect(feed.posts.length).toBe(0);
  });

  it('should skip duplicate candidates on repeated ticks without creating duplicate posts', async () => {
    const mockTopics: DiscoveredTopic[] = [
      {
        id: 't-repeat-1',
        title: 'vLLM Kernel Optimization for FP8 Quantization',
        summary: 'Systematic analysis of GPU kernel throughput.',
        url: 'https://github.com/vllm-project/vllm/releases/tag/v0.6.1',
        publishedAt: new Date().toISOString(),
        sourceName: 'vLLM Releases',
        sourceType: 'github_release',
        discoveredAt: new Date().toISOString(),
      },
    ];

    const mockDiscovery = {
      discoverTopics: vi.fn().mockResolvedValue(mockTopics),
    };

    agentService = new NexusAgentService({
      store,
      memory,
      discovery: mockDiscovery as any,
      judge,
      generator,
    });

    await agentService.initialize({ name: 'NEXUS', domain: 'AI Engineering' });

    // First tick -> publishes
    const tick1 = await agentService.runAutonomousCycle();
    expect(tick1.status).toBe('published');

    // Second tick -> skipped as duplicate
    const tick2 = await agentService.runAutonomousCycle();
    expect(tick2.status).toBe('all_rejected');
    expect(tick2.skippedDuplicatesCount).toBe(1);

    const feed = await agentService.getFeed();
    expect(feed.posts.length).toBe(1); // Still exactly 1 post
  });
});
