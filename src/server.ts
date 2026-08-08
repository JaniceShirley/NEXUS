import { config } from './config/env.js';
import { JsonFileStore } from './persistence/jsonFileStore.js';
import { MemoryService } from './memory/memoryService.js';
import { NexusAgentService } from './agent/agentService.js';
import { SchedulerService } from './scheduler/schedulerService.js';
import { LiveTopicDiscoveryService } from './discovery/topicDiscoveryService.js';
import { NexusEditorialJudge } from './editorial/editorialJudge.js';
import { NexusContentGenerator } from './generation/contentGenerator.js';
import { GeminiLlmProvider } from './generation/providers/geminiLlmProvider.js';
import { MockLlmProvider } from './generation/providers/mockLlmProvider.js';
import { createApp } from './api/app.js';

async function bootstrap() {
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

  if (geminiProvider.isAvailable()) {
    console.log(`[Bootstrap] Production Gemini LLM Provider configured (${geminiProvider.getModelName()}).`);
  } else {
    console.log('[Bootstrap] Notice: No GEMINI_API_KEY found. Falling back to MockLlmProvider for development.');
  }

  const generator = new NexusContentGenerator(llmProvider);

  const agentService = new NexusAgentService({
    store,
    memory,
    discovery,
    judge,
    generator,
  });

  const schedulerService = new SchedulerService(agentService, config.publishIntervalMinutes);

  // Auto-resume scheduler if agent was previously initialized before server restart
  if (config.autoStartScheduler) {
    const resumed = await schedulerService.checkAndAutoStart();
    if (resumed) {
      console.log('[Bootstrap] Previous agent state detected. Autonomous scheduler auto-resumed.');
    }
  }

  const app = createApp(agentService, schedulerService, store, memory, llmProvider);

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[NEXUS Server] Listening on http://0.0.0.0:${config.port}`);
    console.log(`[NEXUS Server] Environment: ${config.nodeEnv}`);
    console.log(`[NEXUS Server] Memory Provider: ${memory.getProviderName()}`);
    console.log(`[NEXUS Server] LLM Provider: ${llmProvider.name}`);
    console.log(`[NEXUS Server] Persistent Storage Path: ${config.dataDir}`);
  });

  // Graceful shutdown handling for deployment platforms (Railway / Kubernetes / Docker)
  const gracefulShutdown = (signal: string) => {
    console.log(`\n[NEXUS Server] Received ${signal}. Initiating graceful shutdown...`);
    schedulerService.stop();
    server.close(() => {
      console.log('[NEXUS Server] HTTP server closed cleanly. Exiting.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal startup error:', err);
  process.exit(1);
});
