import { MemoryEntry, MemoryProvider, MemorySearchResult } from '../types.js';

export class BreethMemoryProvider implements MemoryProvider {
  name = 'breeth';
  private apiKey: string;
  private baseUrl: string;
  private fallback: MemoryProvider;

  constructor(apiKey: string, baseUrl: string, fallbackProvider: MemoryProvider) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fallback = fallbackProvider;
  }

  async store(content: string, metadata?: Record<string, unknown>): Promise<MemoryEntry> {
    if (!this.apiKey) {
      return this.fallback.store(content, metadata);
    }
    try {
      const response = await fetch(`${this.baseUrl}/v1/episodes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ content, source_description: 'nexus-agent' }),
      });
      if (!response.ok) {
        throw new Error(`Breeth API error: ${response.statusText}`);
      }
      const data = (await response.json()) as { episode_name?: string };
      const entry: MemoryEntry = {
        id: data.episode_name || `breeth-${Date.now()}`,
        content,
        metadata,
        createdAt: new Date().toISOString(),
      };
      // Also sync to local fallback for maximum reliability
      await this.fallback.store(content, metadata);
      return entry;
    } catch (err) {
      console.warn('[BreethMemoryProvider] Failed to store to Breeth, using fallback:', err);
      return this.fallback.store(content, metadata);
    }
  }

  async search(query: string, limit: number = 10): Promise<MemorySearchResult[]> {
    if (!this.apiKey) {
      return this.fallback.search(query, limit);
    }
    try {
      const response = await fetch(`${this.baseUrl}/v1/graph/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query, limit }),
      });
      if (!response.ok) {
        throw new Error(`Breeth search error: ${response.statusText}`);
      }
      const data = (await response.json()) as { edges?: Array<{ fact?: string }> };
      const edges = data.edges || [];
      const results: MemorySearchResult[] = edges.map((e, idx) => ({
        entry: {
          id: `breeth-edge-${idx}`,
          content: e.fact || '',
          createdAt: new Date().toISOString(),
        },
        similarityScore: 1.0,
      }));
      return results.length > 0 ? results : this.fallback.search(query, limit);
    } catch (err) {
      console.warn('[BreethMemoryProvider] Failed to search Breeth, using fallback:', err);
      return this.fallback.search(query, limit);
    }
  }

  async getRecent(limit: number = 10): Promise<MemoryEntry[]> {
    return this.fallback.getRecent(limit);
  }
}
