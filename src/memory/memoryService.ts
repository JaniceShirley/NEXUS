import { MemoryEntry, MemoryProvider, MemorySearchResult } from './types.js';
import { LocalMemoryProvider } from './providers/localMemoryProvider.js';
import { BreethMemoryProvider } from './providers/breethMemoryProvider.js';

export class MemoryService {
  private activeProvider: MemoryProvider;

  constructor(providerType: 'local' | 'breeth' = 'local', breethApiKey = '', breethBaseUrl = '') {
    const localProvider = new LocalMemoryProvider();
    if (providerType === 'breeth') {
      this.activeProvider = new BreethMemoryProvider(breethApiKey, breethBaseUrl, localProvider);
    } else {
      this.activeProvider = localProvider;
    }
  }

  getProviderName(): string {
    return this.activeProvider.name;
  }

  async storeMemory(content: string, metadata?: Record<string, unknown>): Promise<MemoryEntry> {
    return this.activeProvider.store(content, metadata);
  }

  async searchMemory(query: string, limit = 10): Promise<MemorySearchResult[]> {
    return this.activeProvider.search(query, limit);
  }

  async getRecentMemories(limit = 10): Promise<MemoryEntry[]> {
    return this.activeProvider.getRecent(limit);
  }
}
