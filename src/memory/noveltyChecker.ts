import { DiscoveredTopic } from '../discovery/types.js';
import { MemoryService } from './memoryService.js';
import { PersistenceStore, Post } from '../persistence/types.js';

export interface NoveltyCheckResult {
  isDuplicate: boolean;
  reason?: string;
  similarityScore?: number;
}

export class NoveltyChecker {
  private store: PersistenceStore;
  private memory: MemoryService;

  constructor(store: PersistenceStore, memory: MemoryService) {
    this.store = store;
    this.memory = memory;
  }

  private normalizeUrl(url: string): string {
    return url.toLowerCase().split('#')[0].replace(/\/$/, '');
  }

  private normalizeText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3); // Filter short stop words
  }

  async isTopicNovel(topic: DiscoveredTopic): Promise<NoveltyCheckResult> {
    const normUrl = this.normalizeUrl(topic.url);

    // 1. Direct Topic ID / URL check in persistence
    const seenByIdOrUrl = await this.store.hasSeenTopic(topic.id);
    if (seenByIdOrUrl) {
      return { isDuplicate: true, reason: `Topic ID ${topic.id} has already been processed.` };
    }

    const seenByUrl = await this.store.hasSeenTopic(normUrl);
    if (seenByUrl) {
      return { isDuplicate: true, reason: `URL ${topic.url} has already been processed.` };
    }

    // 2. Comparison against previously published posts
    const previousPosts = await this.store.getPosts();
    const candidateTokens = new Set(this.normalizeText(topic.title));

    for (const post of previousPosts) {
      // Check source URL matches in previous posts
      if (post.sources?.some((s) => this.normalizeUrl(s) === normUrl)) {
        return { isDuplicate: true, reason: `Source URL ${topic.url} matches published post ${post.id}.` };
      }

      // Token overlap check
      const postTokens = this.normalizeText(post.text);
      let matchCount = 0;
      for (const token of candidateTokens) {
        if (postTokens.includes(token)) matchCount++;
      }

      if (candidateTokens.size > 0) {
        const overlapRatio = matchCount / candidateTokens.size;
        if (overlapRatio >= 0.7) {
          return {
            isDuplicate: true,
            reason: `High title/content overlap (${Math.round(overlapRatio * 100)}%) with published post ${post.id}.`,
            similarityScore: overlapRatio,
          };
        }
      }
    }

    // 3. Memory Search via MemoryService
    try {
      const memoryHits = await this.memory.searchMemory(topic.title, 5);
      for (const hit of memoryHits) {
        if ((hit.similarityScore || 0) >= 0.8) {
          return {
            isDuplicate: true,
            reason: `High similarity (${Math.round((hit.similarityScore || 0) * 100)}%) with remembered context.`,
            similarityScore: hit.similarityScore,
          };
        }
      }
    } catch (memErr) {
      console.warn('[NoveltyChecker] Memory search warning:', memErr);
    }

    return { isDuplicate: false };
  }
}
