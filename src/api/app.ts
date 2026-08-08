import express from 'express';
import cors from 'cors';
import { createRouter } from './routes.js';
import { AgentService } from '../agent/types.js';
import { SchedulerService } from '../scheduler/schedulerService.js';
import { PersistenceStore } from '../persistence/types.js';
import { MemoryService } from '../memory/memoryService.js';
import { LlmProvider } from '../generation/types.js';

export function createApp(
  agentService: AgentService,
  schedulerService: SchedulerService,
  store: PersistenceStore,
  memoryService: MemoryService,
  llmProvider: LlmProvider
): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const router = createRouter(agentService, schedulerService, store, memoryService, llmProvider);
  app.use('/api', router);

  return app;
}
