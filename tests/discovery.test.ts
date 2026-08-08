import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RSSFetcher, RSSFeedSource } from '../src/discovery/rssFetcher.js';
import { LiveTopicDiscoveryService } from '../src/discovery/topicDiscoveryService.js';

describe('Live Topic Discovery & RSSFetcher', () => {
  const fetcher = new RSSFetcher();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse RSS channel items correctly', async () => {
    const mockRssXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>arXiv cs.AI</title>
        <item>
          <title>Speculative Decoding for Distributed LLM Inference</title>
          <link>https://arxiv.org/abs/2408.00001</link>
          <description>&lt;p&gt;We propose a new speculative decoding algorithm.&lt;/p&gt;</description>
          <pubDate>Fri, 08 Aug 2026 12:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => mockRssXml,
    } as any);

    const source: RSSFeedSource = { name: 'arXiv cs.AI', url: 'https://rss.arxiv.org/rss/cs.AI', type: 'arxiv' };
    const items = await fetcher.fetchFeed(source);

    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Speculative Decoding for Distributed LLM Inference');
    expect(items[0].url).toBe('https://arxiv.org/abs/2408.00001');
    expect(items[0].summary).toContain('speculative decoding algorithm');
    expect(items[0].sourceName).toBe('arXiv cs.AI');
  });

  it('should parse Atom entries correctly', async () => {
    const mockAtomXml = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>vLLM Releases</title>
      <entry>
        <title>vLLM v0.6.0 Release: FP8 KV Cache &amp; Chunked Prefill</title>
        <link rel="alternate" href="https://github.com/vllm-project/vllm/releases/tag/v0.6.0"/>
        <updated>2026-08-08T10:00:00Z</updated>
        <content type="html">Features FP8 KV Cache support for low memory footprint.</content>
      </entry>
    </feed>`;

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => mockAtomXml,
    } as any);

    const source: RSSFeedSource = { name: 'vLLM Releases', url: 'https://github.com/vllm-project/vllm/releases.atom', type: 'github_release' };
    const items = await fetcher.fetchFeed(source);

    expect(items.length).toBe(1);
    expect(items[0].title).toBe('vLLM v0.6.0 Release: FP8 KV Cache & Chunked Prefill');
    expect(items[0].url).toBe('https://github.com/vllm-project/vllm/releases/tag/v0.6.0');
    expect(items[0].sourceType).toBe('github_release');
  });

  it('should tolerate source network failure without crashing', async () => {
    const source1: RSSFeedSource = { name: 'Source Fails', url: 'https://invalid.url/feed', type: 'rss' };
    const source2: RSSFeedSource = { name: 'Source Succeeds', url: 'https://valid.url/feed', type: 'arxiv' };

    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network offline'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<rss><channel><item><title>Valid Paper</title><link>https://arxiv.org/abs/2408.00002</link></item></channel></rss>`,
      } as any);

    const service = new LiveTopicDiscoveryService([source1, source2], fetcher);
    const candidates = await service.discoverTopics();

    expect(candidates.length).toBe(1);
    expect(candidates[0].title).toBe('Valid Paper');
  });

  it('should deduplicate candidates with identical URLs or normalized titles', async () => {
    const source1: RSSFeedSource = { name: 'Source A', url: 'https://sourcea.com/feed', type: 'arxiv' };
    const source2: RSSFeedSource = { name: 'Source B', url: 'https://sourceb.com/feed', type: 'huggingface' };

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<rss><channel><item><title>Duplicate Title</title><link>https://example.com/item1</link></item></channel></rss>`,
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<rss><channel><item><title>Duplicate Title!</title><link>https://example.com/item1</link></item></channel></rss>`,
      } as any);

    const service = new LiveTopicDiscoveryService([source1, source2], fetcher);
    const candidates = await service.discoverTopics();

    expect(candidates.length).toBe(1); // Deduplicated to 1 candidate
  });
});
