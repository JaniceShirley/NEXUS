export interface MemoryEntry {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  similarityScore?: number;
}

export interface MemoryProvider {
  name: string;
  store(content: string, metadata?: Record<string, unknown>): Promise<MemoryEntry>;
  search(query: string, limit?: number): Promise<MemorySearchResult[]>;
  getRecent(limit?: number): Promise<MemoryEntry[]>;
}
