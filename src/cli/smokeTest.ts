import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { JsonFileStore } from '../persistence/jsonFileStore.js';
import { MemoryService } from '../memory/memoryService.js';
import { NexusAgentService } from '../agent/agentService.js';
import { LiveTopicDiscoveryService } from '../discovery/topicDiscoveryService.js';
import { NexusEditorialJudge } from '../editorial/editorialJudge.js';
import { NexusContentGenerator } from '../generation/contentGenerator.js';
import { GeminiLlmProvider } from '../generation/providers/geminiLlmProvider.js';

async function main() {
  console.log('==================================================');
  console.log('NEXUS Real End-to-End Integration Smoke Test');
  console.log('==================================================\n');

  const geminiProvider = new GeminiLlmProvider(config.geminiApiKey, config.geminiModel);

  if (!geminiProvider.isAvailable()) {
    console.error('ERROR: GEMINI_API_KEY is not configured in environment.');
    console.error('Real integration smoke test requires a valid GEMINI_API_KEY to test real production LLM post generation.');
    process.exit(1);
  }

  console.log(`Using configured Gemini LLM Model: ${geminiProvider.getModelName()}`);

  const tempSmokeDir = path.resolve('./data-smoke-test');
  if (fs.existsSync(tempSmokeDir)) {
    fs.rmSync(tempSmokeDir, { recursive: true, force: true });
  }

  const store = new JsonFileStore(tempSmokeDir);
  const memory = new MemoryService('local');
  const discovery = new LiveTopicDiscoveryService();
  const judge = new NexusEditorialJudge();
  const generator = new NexusContentGenerator(geminiProvider);

  const agent = new NexusAgentService({
    store,
    memory,
    discovery,
    judge,
    generator,
  });

  try {
    console.log('1. Initializing NEXUS agent...');
    const initRes = await agent.initialize({ name: 'NEXUS', domain: 'AI Engineering' });
    console.log(`   Initialized agent ID: ${initRes.agentId}\n`);

    console.log('2. Running real autonomous tick (Live Discovery -> Editorial -> Real Gemini LLM -> Persistence)...');
    const tickRes = await agent.runAutonomousCycle();

    console.log(`   Tick Status: ${tickRes.status}`);
    console.log(`   Discovered Topics: ${tickRes.discoveredCount}`);
    console.log(`   Evaluated Topics: ${tickRes.evaluatedCount}`);
    console.log(`   Accepted Topics: ${tickRes.acceptedCount}`);
    console.log(`   Rejected Topics: ${tickRes.rejectedCount}`);
    console.log(`   Duration: ${tickRes.durationMs}ms\n`);

    if (tickRes.status === 'published' && tickRes.publishedPost) {
      console.log('3. Retrieving persisted feed...');
      const feed = await agent.getFeed();
      console.log(`   Feed post count: ${feed.posts.length}`);
      console.log('   Published Post Metadata:');
      console.log(JSON.stringify(feed.posts[0], null, 2));
    } else {
      console.log('   No post published during this tick cycle.');
      if (tickRes.rejections && tickRes.rejections.length > 0) {
        console.log('   Rejection Log Examples:');
        tickRes.rejections.slice(0, 3).forEach((r) => {
          console.log(`   - "${r.title}": ${r.reason}`);
        });
      }
    }

    console.log('\nSUCCESS: Real integration smoke test completed.');
  } finally {
    if (fs.existsSync(tempSmokeDir)) {
      fs.rmSync(tempSmokeDir, { recursive: true, force: true });
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\nFAIL: Real integration smoke test error:', err);
  process.exit(1);
});
