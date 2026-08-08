import { describe, it, expect } from 'vitest';
import { MemoryService } from '../src/memory/memoryService.js';
import { LocalMemoryProvider } from '../src/memory/providers/localMemoryProvider.js';

describe('MemoryService & LocalMemoryProvider', () => {
  it('should store and retrieve memories locally', async () => {
    const memoryService = new MemoryService('local');
    expect(memoryService.getProviderName()).toBe('local');

    const entry = await memoryService.storeMemory(
      'NEXUS is an autonomous AI engineering persona focusing on signal over hype.',
      { type: 'test' }
    );

    expect(entry.id).toBeDefined();
    expect(entry.content).toContain('NEXUS');

    const searchResults = await memoryService.searchMemory('autonomous persona');
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].entry.content).toContain('NEXUS');
  });

  it('should list recent memories in chronological order', async () => {
    const provider = new LocalMemoryProvider();
    await provider.store('Memory A');
    await provider.store('Memory B');

    const recent = await provider.getRecent(10);
    expect(recent.length).toBe(2);
    expect(recent[0].content).toBe('Memory B'); // Recent first
  });
});
