import { MemoryEntry, MemoryProvider, MemorySearchResult } from '../types.js';

export class LocalMemoryProvider implements MemoryProvider {
  name = 'local';
  private entries: MemoryEntry[] = [];

  async store(content: string, metadata?: Record<string, unknown>): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      content,
      metadata,
      createdAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  async search(query: string, limit: number = 10): Promise<MemorySearchResult[]> {
    const keywords = query.toLowerCase().split(/\s+/);
    const results = this.entries.map((entry) => {
      const lower = entry.content.toLowerCase();
      let matchCount = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) matchCount++;
      }
      return {
        entry,
        similarityScore: keywords.length > 0 ? matchCount / keywords.length : 0,
      };
    });

    return results
      .filter((r) => (r.similarityScore || 0) > 0)
      .sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0))
      .slice(0, limit);
  }

  async getRecent(limit: number = 10): Promise<MemoryEntry[]> {
    return [...this.entries].reverse().slice(0, limit);
  }
}
