import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRouter } from './routes.js';
import { AgentService } from '../agent/types.js';
import { SchedulerService } from '../scheduler/schedulerService.js';
import { PersistenceStore } from '../persistence/types.js';
import { MemoryService } from '../memory/memoryService.js';
import { LlmProvider } from '../generation/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Compiled output lives at dist/api/app.js, so ../../public resolves to <repo>/public.
const publicDir = path.resolve(__dirname, '../../public');

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

  // Read-only static frontend. Mounted after /api so it can never intercept
  // an API route; existing agent/scheduler/API logic above is untouched.
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
