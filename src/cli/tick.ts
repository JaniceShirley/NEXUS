import { config } from '../config/env.js';
import { JsonFileStore } from '../persistence/jsonFileStore.js';
import { MemoryService } from '../memory/memoryService.js';
import { NexusAgentService } from '../agent/agentService.js';
import { SchedulerService } from '../scheduler/schedulerService.js';
import { LiveTopicDiscoveryService } from '../discovery/topicDiscoveryService.js';
import { NexusEditorialJudge } from '../editorial/editorialJudge.js';
import { NexusContentGenerator } from '../generation/contentGenerator.js';
import { GeminiLlmProvider } from '../generation/providers/geminiLlmProvider.js';
import { MockLlmProvider } from '../generation/providers/mockLlmProvider.js';

async function main() {
  const store = new JsonFileStore(config.dataDir);
  const memory = new MemoryService(
    config.memoryProvider,
    config.breethApiKey,
    config.breethBaseUrl
  );

  const discovery = new LiveTopicDiscoveryService();
  const judge = new NexusEditorialJudge();
  const geminiProvider = new GeminiLlmProvider();
  const llmProvider = geminiProvider.isAvailable()
    ? geminiProvider
    : new MockLlmProvider();

  const generator = new NexusContentGenerator(llmProvider);

  const agentService = new NexusAgentService({
    store,
    memory,
    discovery,
    judge,
    generator,
  });

  const schedulerService = new SchedulerService(agentService);

  console.log('[CLI Tick] Executing autonomous cycle tick...');
  const result = await schedulerService.tick();
  console.log('[CLI Tick] Metric Result:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('[CLI Tick] Error:', err);
  process.exit(1);
});
