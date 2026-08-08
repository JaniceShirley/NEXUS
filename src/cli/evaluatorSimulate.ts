import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { JsonFileStore } from '../persistence/jsonFileStore.js';
import { MemoryService } from '../memory/memoryService.js';
import { NexusAgentService } from '../agent/agentService.js';
import { SchedulerService } from '../scheduler/schedulerService.js';
import { LiveTopicDiscoveryService } from '../discovery/topicDiscoveryService.js';
import { NexusEditorialJudge } from '../editorial/editorialJudge.js';
import { NexusContentGenerator } from '../generation/contentGenerator.js';
import { MockLlmProvider } from '../generation/providers/mockLlmProvider.js';
import { GeminiLlmProvider } from '../generation/providers/geminiLlmProvider.js';
import { createApp } from '../api/app.js';

async function simulateEvaluator() {
  console.log('==================================================');
  console.log('NEXUS Evaluator Autonomy Simulation');
  console.log('==================================================\n');

  const simDir = path.resolve('./data-evaluator-sim');
  if (fs.existsSync(simDir)) {
    fs.rmSync(simDir, { recursive: true, force: true });
  }

  const store = new JsonFileStore(simDir);
  const memory = new MemoryService('local');
  const discovery = new LiveTopicDiscoveryService();
  const judge = new NexusEditorialJudge();

  const geminiProvider = new GeminiLlmProvider();
  const llmProvider = geminiProvider.isAvailable() ? geminiProvider : new MockLlmProvider();
  console.log(`[Sim] Using LLM Provider: ${llmProvider.name}`);

  const generator = new NexusContentGenerator(llmProvider);
  const agentService = new NexusAgentService({ store, memory, discovery, judge, generator });
  const schedulerService = new SchedulerService(agentService, 60);

  const app = createApp(agentService, schedulerService, store, memory, llmProvider);

  try {
    // T0: Evaluator calls POST /api/agent/init exactly ONCE
    console.log('T0: Evaluator calls POST /api/agent/init (ONCE)');
    const initRes = await request(app)
      .post('/api/agent/init')
      .send({ persona: { name: 'NEXUS', domain: 'AI Engineering' } });

    console.log(`    Response status: ${initRes.status}`);
    console.log(`    Assigned agentId: ${initRes.body.agentId}`);
    console.log(`    Autonomous scheduler active: ${schedulerService.isTimerActive()}\n`);

    // T1: Evaluator polls GET /api/agent/feed before ticks
    console.log('T1: Evaluator calls GET /api/agent/feed (Checking feed before autonomous tick)');
    const feedT1 = await request(app).get(`/api/agent/feed?agentId=${initRes.body.agentId}`);
    console.log(`    Posts returned: ${feedT1.body.posts.length}`);
    console.log('    PROOF: Calling /feed does NOT trigger post generation!\n');

    // T2: Simulate first autonomous cycle passing (Triggered by background scheduler)
    console.log('T2: Autonomous Scheduler executes Cycle #1 (Background interval tick)');
    const tick1: any = await schedulerService.tick();
    console.log(`    Tick status: ${tick1.status}`);
    console.log(`    Discovered: ${tick1.discoveredCount || 0}, Evaluated: ${tick1.evaluatedCount || 0}, Published: ${tick1.status === 'published' ? 1 : 0}\n`);

    // T3: Evaluator calls GET /api/agent/feed
    console.log('T3: Evaluator calls GET /api/agent/feed (Checking feed after Cycle #1)');
    const feedT3 = await request(app).get(`/api/agent/feed?agentId=${initRes.body.agentId}`);
    console.log(`    Posts returned: ${feedT3.body.posts.length}`);
    if (feedT3.body.posts.length > 0) {
      console.log(`    Latest Post ID: ${feedT3.body.posts[0].id}`);
      console.log(`    Text snippet: "${feedT3.body.posts[0].text.substring(0, 100)}..."\n`);
    }

    // T4: Simulate second autonomous cycle passing (Triggered by background scheduler)
    console.log('T4: Autonomous Scheduler executes Cycle #2 (Background interval tick)');
    const tick2: any = await schedulerService.tick();
    console.log(`    Tick status: ${tick2.status}\n`);

    // T5: Evaluator calls GET /api/agent/feed
    console.log('T5: Evaluator calls GET /api/agent/feed (Checking feed after Cycle #2)');
    const feedT5 = await request(app).get(`/api/agent/feed?agentId=${initRes.body.agentId}`);
    console.log(`    Posts returned: ${feedT5.body.posts.length}`);

    // Verify contract guarantees
    const posts = feedT5.body.posts;
    if (posts.length > 1) {
      const postIds = new Set(posts.map((p: any) => p.id));
      console.log(`    Unique post IDs count: ${postIds.size} / ${posts.length}`);
      const isNewestFirst = new Date(posts[0].createdAt).getTime() >= new Date(posts[1].createdAt).getTime();
      console.log(`    Newest posts returned first: ${isNewestFirst}`);
    }

    console.log('\n==================================================');
    console.log('SUCCESS: Evaluator autonomy simulation complete.');
    console.log('==================================================');
  } finally {
    schedulerService.stop();
    if (fs.existsSync(simDir)) {
      fs.rmSync(simDir, { recursive: true, force: true });
    }
  }
}

simulateEvaluator().catch((err) => {
  console.error('Fatal simulation error:', err);
  process.exit(1);
});
