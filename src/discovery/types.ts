export interface DiscoveredTopic {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  sourceName: string;
  sourceType: 'arxiv' | 'github_release' | 'huggingface' | 'rss';
  discoveredAt: string;
  rawContent?: string;
  domain?: string;
}

export interface TopicDiscoveryOptions {
  maxCandidatesPerSource?: number;
  maxTotalCandidates?: number;
  timeoutMs?: number;
}

export interface TopicDiscoveryService {
  discoverTopics(options?: TopicDiscoveryOptions): Promise<DiscoveredTopic[]>;
}
