import { Router, Request, Response } from 'express';
import { AgentService } from '../agent/types.js';
import { SchedulerService } from '../scheduler/schedulerService.js';
import { PersistenceStore } from '../persistence/types.js';
import { MemoryService } from '../memory/memoryService.js';
import { LlmProvider } from '../generation/types.js';

export function createRouter(
  agentService: AgentService,
  schedulerService: SchedulerService,
  store: PersistenceStore,
  memoryService: MemoryService,
  llmProvider: LlmProvider
): Router {
  const router = Router();

  // POST /api/agent/init
  router.post('/agent/init', async (req: Request, res: Response) => {
    try {
      const persona = req.body?.persona || {};
      const result = await agentService.initialize({
        name: persona.name || 'NEXUS',
        domain: persona.domain || 'AI Engineering',
      });

      // Start autonomous scheduler if not active
      schedulerService.start();

      res.status(200).json({ agentId: result.agentId });
    } catch (err) {
      console.error('[API] Initialization error:', err);
      res.status(500).json({ error: 'Failed to initialize agent' });
    }
  });

  // GET /api/agent/feed?agentId=abc-123
  router.get('/agent/feed', async (req: Request, res: Response) => {
    try {
      // Pure read from persistence store. Does NOT trigger ticks or generation!
      const feed = await agentService.getFeed();
      res.status(200).json({ posts: feed.posts });
    } catch (err) {
      console.error('[API] Feed fetch error:', err);
      res.status(500).json({ error: 'Failed to retrieve feed' });
    }
  });

  // GET /api/health (Deployment diagnostic health check)
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const state = await store.getAgentState();
      res.status(200).json({
        status: 'ok',
        initialized: state.initialized,
        agentId: state.agentId,
        schedulerActive: schedulerService.isTimerActive(),
        memoryProvider: memoryService.getProviderName(),
        llmProvider: llmProvider.name,
        lastRunAt: state.lastRunAt || null,
        lastTickMetrics: state.lastTickMetrics || null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: String(err) });
    }
  });

  // POST /api/agent/tick (Manual/Platform Cron trigger for serverless support)
  router.post('/agent/tick', async (_req: Request, res: Response) => {
    try {
      const result = await schedulerService.tick();
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
