import { DEFAULT_LIVE_SOURCES, LiveTopicDiscoveryService } from '../discovery/topicDiscoveryService.js';
import { RSSFetcher } from '../discovery/rssFetcher.js';

async function main() {
  console.log('==================================================');
  console.log('NEXUS Live Discovery Check');
  console.log('==================================================\n');

  const fetcher = new RSSFetcher();
  const discovery = new LiveTopicDiscoveryService(DEFAULT_LIVE_SOURCES, fetcher);

  console.log(`Attempting discovery across ${DEFAULT_LIVE_SOURCES.length} live public sources...\n`);

  const startTime = Date.now();
  let candidates = [];
  try {
    candidates = await discovery.discoverTopics({
      maxCandidatesPerSource: 3,
      maxTotalCandidates: 10,
      timeoutMs: 6000,
    });
  } catch (err: any) {
    console.error('Discovery execution error:', err.message || String(err));
    process.exit(1);
  }

  const durationMs = Date.now() - startTime;

  console.log(`Discovery Completed in ${durationMs}ms`);
  console.log(`Discovered ${candidates.length} unique candidates.\n`);

  console.log('--- Candidate Highlights ---');
  candidates.slice(0, 5).forEach((item, idx) => {
    console.log(`${idx + 1}. [${item.sourceName}] ${item.title}`);
    console.log(`   URL: ${item.url}`);
    console.log(`   Published: ${item.publishedAt}\n`);
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Discovery Check error:', err);
  process.exit(1);
});
