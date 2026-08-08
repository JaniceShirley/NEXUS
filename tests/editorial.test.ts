import { describe, it, expect } from 'vitest';
import { NexusEditorialJudge } from '../src/editorial/editorialJudge.js';
import { DiscoveredTopic } from '../src/discovery/types.js';

describe('NexusEditorialJudge Scoring & Edge Cases', () => {
  const judge = new NexusEditorialJudge(0.65);

  it('should ACCEPT high-signal technical research topics', async () => {
    const topic: DiscoveredTopic = {
      id: 't-1',
      title: 'vLLM Chunked Prefill and Speculative Decoding Optimization',
      summary: 'Detailed evaluation of memory overhead reduction and KV cache allocation during high-concurrency LLM inference.',
      url: 'https://arxiv.org/abs/2408.00100',
      publishedAt: new Date().toISOString(),
      sourceName: 'arXiv cs.AI',
      sourceType: 'arxiv',
      discoveredAt: new Date().toISOString(),
    };

    const decision = await judge.evaluateTopic(topic, []);
    expect(decision.decision).toBe('ACCEPT');
    expect(decision.score).toBeGreaterThanOrEqual(0.65);
    expect(decision.strengths.length).toBeGreaterThan(0);
    expect(decision.reasons[0]).toContain('Accepted with signal score');
  });

  it('should ACCEPT a technically significant launch with real engineering signals', async () => {
    const topic: DiscoveredTopic = {
      id: 't-launch-tech',
      title: 'vLLM v0.6.0 Launches New FP8 KV Cache Kernel Optimization and Speculative Decoding',
      summary: 'Release features CUDA kernel improvements reducing GPU memory footprint during high throughput serving.',
      url: 'https://github.com/vllm-project/vllm/releases/tag/v0.6.0',
      publishedAt: new Date().toISOString(),
      sourceName: 'vLLM Releases',
      sourceType: 'github_release',
      discoveredAt: new Date().toISOString(),
    };

    const decision = await judge.evaluateTopic(topic, []);
    expect(decision.decision).toBe('ACCEPT');
    expect(decision.score).toBeGreaterThanOrEqual(0.65);
  });

  it('should REJECT a marketing-heavy launch lacking technical depth', async () => {
    const topic: DiscoveredTopic = {
      id: 't-launch-mktg',
      title: 'Company X Launches New Revolutionary AI Assistant Waitlist with $50M Funding Round',
      summary: 'Startup raises funding round for new revolutionary social app waitlist teaser.',
      url: 'https://techblog.com/hype-news',
      publishedAt: new Date().toISOString(),
      sourceName: 'Tech Hype Feed',
      sourceType: 'rss',
      discoveredAt: new Date().toISOString(),
    };

    const decision = await judge.evaluateTopic(topic, []);
    expect(decision.decision).toBe('REJECT');
    expect(decision.matchedRejection).toBeDefined();
    expect(decision.score).toBeLessThan(0.65);
  });

  it('should REJECT off-domain topics lacking technical signals', async () => {
    const topic: DiscoveredTopic = {
      id: 't-3',
      title: 'Celebrity Partnership Announced for Upcoming Entertainment Event',
      summary: 'General entertainment news with no technical or engineering relevance.',
      url: 'https://news.com/entertainment',
      publishedAt: new Date().toISOString(),
      sourceName: 'General News',
      sourceType: 'rss',
      discoveredAt: new Date().toISOString(),
    };

    const decision = await judge.evaluateTopic(topic, []);
    expect(decision.decision).toBe('REJECT');
    expect(decision.score).toBeLessThan(0.65);
  });

  it('should apply penalty to stale publications older than 30 days', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const topic: DiscoveredTopic = {
      id: 't-4',
      title: 'KV Cache Compression in Open Source LLM Runtimes',
      summary: 'Technical study of quantization techniques.',
      url: 'https://arxiv.org/abs/2401.00000',
      publishedAt: thirtyOneDaysAgo,
      sourceName: 'arXiv cs.LG',
      sourceType: 'arxiv',
      discoveredAt: new Date().toISOString(),
    };

    const decision = await judge.evaluateTopic(topic, []);
    expect(decision.weaknesses.some((w) => w.includes('Stale publication'))).toBe(true);
  });

  it('should reject a duplicate story overlapping substantially with published history', async () => {
    const history = ['Speculative Decoding for Distributed LLM Inference optimization'];
    const topic: DiscoveredTopic = {
      id: 't-dup-hist',
      title: 'Speculative Decoding for Distributed LLM Inference',
      summary: 'Identical research paper summary.',
      url: 'https://arxiv.org/abs/2408.00001-dup',
      publishedAt: new Date().toISOString(),
      sourceName: 'arXiv cs.AI',
      sourceType: 'arxiv',
      discoveredAt: new Date().toISOString(),
    };

    const decision = await judge.evaluateTopic(topic, history);
    expect(decision.decision).toBe('REJECT');
    expect(decision.weaknesses.some((w) => w.includes('Substantial overlap'))).toBe(true);
  });
});
