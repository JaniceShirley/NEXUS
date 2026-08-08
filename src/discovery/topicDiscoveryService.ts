import { DiscoveredTopic, TopicDiscoveryOptions, TopicDiscoveryService } from './types.js';
import { RSSFetcher, RSSFeedSource } from './rssFetcher.js';

export const DEFAULT_LIVE_SOURCES: RSSFeedSource[] = [
  {
    name: 'arXiv cs.AI',
    url: 'https://rss.arxiv.org/rss/cs.AI',
    type: 'arxiv',
  },
  {
    name: 'arXiv cs.CL (NLP & LLMs)',
    url: 'https://rss.arxiv.org/rss/cs.CL',
    type: 'arxiv',
  },
  {
    name: 'arXiv cs.LG (Machine Learning)',
    url: 'https://rss.arxiv.org/rss/cs.LG',
    type: 'arxiv',
  },
  {
    name: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog/feed.xml',
    type: 'huggingface',
  },
  {
    name: 'vLLM Releases',
    url: 'https://github.com/vllm-project/vllm/releases.atom',
    type: 'github_release',
  },
  {
    name: 'Transformers Releases',
    url: 'https://github.com/huggingface/transformers/releases.atom',
    type: 'github_release',
  },
  {
    name: 'Ollama Releases',
    url: 'https://github.com/ollama/ollama/releases.atom',
    type: 'github_release',
  },
];

export class LiveTopicDiscoveryService implements TopicDiscoveryService {
  private sources: RSSFeedSource[];
  private fetcher: RSSFetcher;

  constructor(sources: RSSFeedSource[] = DEFAULT_LIVE_SOURCES, fetcher = new RSSFetcher()) {
    this.sources = sources;
    this.fetcher = fetcher;
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  async discoverTopics(options: TopicDiscoveryOptions = {}): Promise<DiscoveredTopic[]> {
    const maxPerSource = options.maxCandidatesPerSource || 5;
    const maxTotal = options.maxTotalCandidates || 15;
    const timeoutMs = options.timeoutMs || 5000;

    // Fetch all sources concurrently using Promise.allSettled
    const results = await Promise.allSettled(
      this.sources.map((source) => this.fetcher.fetchFeed(source, timeoutMs))
    );

    const rawCandidates: DiscoveredTopic[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        rawCandidates.push(...result.value.slice(0, maxPerSource));
      }
    }

    // Deduplicate by URL and normalized title
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    const uniqueCandidates: DiscoveredTopic[] = [];

    for (const candidate of rawCandidates) {
      const normUrl = candidate.url.toLowerCase().split('#')[0].replace(/\/$/, '');
      const normTitle = this.normalizeTitle(candidate.title);

      if (!normUrl || !normTitle) continue;
      if (seenUrls.has(normUrl) || seenTitles.has(normTitle)) continue;

      seenUrls.add(normUrl);
      seenTitles.add(normTitle);
      uniqueCandidates.push(candidate);
    }

    // Sort by publication date (newest first)
    uniqueCandidates.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    return uniqueCandidates.slice(0, maxTotal);
  }
}
