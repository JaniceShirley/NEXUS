import crypto from 'crypto';
import { AgentService, FeedResponse, InitResult, TickResult } from './types.js';
import { AgentPersonaData, PersistenceStore, Post } from '../persistence/types.js';
import { MemoryService } from '../memory/memoryService.js';
import { TopicDiscoveryService } from '../discovery/types.js';
import { EditorialJudge } from '../editorial/types.js';
import { ContentGenerator } from '../generation/types.js';
import { NoveltyChecker } from '../memory/noveltyChecker.js';

export class NexusAgentService implements AgentService {
  private store: PersistenceStore;
  private memory: MemoryService;
  private discovery?: TopicDiscoveryService;
  private judge?: EditorialJudge;
  private generator?: ContentGenerator;
  private noveltyChecker: NoveltyChecker;
  private onCycleComplete?: () => void;

  constructor(options: {
    store: PersistenceStore;
    memory: MemoryService;
    discovery?: TopicDiscoveryService;
    judge?: EditorialJudge;
    generator?: ContentGenerator;
    onCycleComplete?: () => void;
  }) {
    this.store = options.store;
    this.memory = options.memory;
    this.discovery = options.discovery;
    this.judge = options.judge;
    this.generator = options.generator;
    this.noveltyChecker = new NoveltyChecker(this.store, this.memory);
    this.onCycleComplete = options.onCycleComplete;
  }

  async isInitialized(): Promise<boolean> {
    const state = await this.store.getAgentState();
    return state.initialized && state.agentId !== null;
  }

  async initialize(persona: AgentPersonaData): Promise<InitResult> {
    const currentState = await this.store.getAgentState();
    // Return existing agentId if already initialized (idempotent init)
    const agentId = currentState.agentId || `agent-${crypto.randomUUID().substring(0, 8)}`;

    const newState = {
      initialized: true,
      agentId,
      persona: {
        name: persona.name || currentState.persona?.name || 'NEXUS',
        domain: persona.domain || currentState.persona?.domain || 'AI Engineering',
      },
      initializedAt: currentState.initializedAt || new Date().toISOString(),
      lastRunAt: currentState.lastRunAt,
      lastTickMetrics: currentState.lastTickMetrics || null,
    };

    await this.store.setAgentState(newState);

    await this.memory.storeMemory(
      `NEXUS Agent initialized with persona name "${newState.persona.name}" in domain "${newState.persona.domain}".`
    );

    if (this.onCycleComplete) {
      this.onCycleComplete();
    }

    return { agentId };
  }

  async getFeed(): Promise<FeedResponse> {
    // Pure read operation from persistence store.
    // DOES NOT trigger topic discovery, LLM generation, or autonomous ticks!
    const posts = await this.store.getPosts();
    return { posts };
  }

  async runAutonomousCycle(): Promise<TickResult> {
    const cycleId = `cycle-${Date.now()}-${crypto.randomUUID().substring(0, 4)}`;
    const startTime = Date.now();
    const startedAt = new Date(startTime).toISOString();

    console.log(`[NEXUS] Cycle started (ID: ${cycleId})`);

    const state = await this.store.getAgentState();
    if (!state.initialized) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;
      console.log(`[NEXUS] Cycle aborted: Agent is uninitialized (${durationMs}ms)`);
      return {
        cycleId,
        timestamp: startedAt,
        startedAt,
        completedAt,
        durationMs,
        status: 'not_initialized',
        discoveredCount: 0,
        evaluatedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        skippedDuplicatesCount: 0,
        error: 'Agent is not initialized yet.',
      };
    }

    // Update last run timestamp
    await this.store.setAgentState({
      ...state,
      lastRunAt: startedAt,
    });

    if (!this.discovery || !this.judge || !this.generator) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;
      console.error(`[NEXUS] Cycle aborted: Discovery, Editorial, or Generator unconfigured (${durationMs}ms)`);
      return {
        cycleId,
        timestamp: startedAt,
        startedAt,
        completedAt,
        durationMs,
        status: 'error',
        discoveredCount: 0,
        evaluatedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        skippedDuplicatesCount: 0,
        error: 'Discovery, Editorial, or Generator components are unconfigured.',
      };
    }

    let discoveredCandidates = [];
    try {
      discoveredCandidates = await this.discovery.discoverTopics({
        maxCandidatesPerSource: 5,
        maxTotalCandidates: 15,
        timeoutMs: 5000,
      });
    } catch (err: any) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;
      console.error(`[NEXUS] Discovery failed: ${err.message || String(err)} (${durationMs}ms)`);
      const result: TickResult = {
        cycleId,
        timestamp: startedAt,
        startedAt,
        completedAt,
        durationMs,
        status: 'error',
        discoveredCount: 0,
        evaluatedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        skippedDuplicatesCount: 0,
        error: `Discovery failed: ${err.message || String(err)}`,
      };
      await this.store.recordTickMetrics(result);
      return result;
    }

    const discoveredCount = discoveredCandidates.length;
    console.log(`[NEXUS] Discovered: ${discoveredCount}`);

    if (discoveredCount === 0) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;
      console.log(`[NEXUS] Cycle completed: 0 topics discovered (${durationMs}ms)`);
      const result: TickResult = {
        cycleId,
        timestamp: startedAt,
        startedAt,
        completedAt,
        durationMs,
        status: 'no_topics',
        discoveredCount: 0,
        evaluatedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        skippedDuplicatesCount: 0,
      };
      await this.store.recordTickMetrics(result);
      return result;
    }

    const previousPosts = await this.store.getPosts();
    const historySummaries = previousPosts.map((p) => p.text);

    let skippedDuplicatesCount = 0;
    let evaluatedCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    const rejections: Array<{ title: string; reason: string }> = [];

    for (const candidate of discoveredCandidates) {
      // Check novelty / duplicate status
      const novelty = await this.noveltyChecker.isTopicNovel(candidate);
      if (novelty.isDuplicate) {
        skippedDuplicatesCount++;
        rejections.push({
          title: candidate.title,
          reason: novelty.reason || 'Skipped as duplicate or previously covered.',
        });
        continue;
      }

      evaluatedCount++;
      const decision = await this.judge.evaluateTopic(candidate, historySummaries);

      if (decision.decision === 'REJECT') {
        rejectedCount++;
        rejections.push({
          title: candidate.title,
          reason: decision.reasons.join('; '),
        });
        await this.store.markTopicSeen(candidate.id);
        await this.store.markTopicSeen(candidate.url);
        continue;
      }

      // Candidate ACCEPTED -> Generate post
      acceptedCount++;
      try {
        const draft = await this.generator.generatePost(candidate, decision);

        const newPost: Post = {
          id: `p-${Date.now()}-${crypto.randomUUID().substring(0, 4)}`,
          createdAt: new Date().toISOString(), // ISO 8601 UTC
          text: draft.text,
          rationale: draft.rationale,
          sources: draft.sources.length > 0 ? draft.sources : [candidate.url],
        };

        // Persist post and mark topic seen
        await this.store.addPost(newPost);
        await this.store.markTopicSeen(candidate.id);
        await this.store.markTopicSeen(candidate.url);

        // Store memory entry
        await this.memory.storeMemory(
          `Published post about "${candidate.title}": ${draft.text.substring(0, 100)}...`,
          { postId: newPost.id, sources: newPost.sources, score: decision.score }
        );

        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTime;

        console.log(`[NEXUS] Rejected: ${rejectedCount}`);
        console.log(`[NEXUS] Accepted: ${acceptedCount}`);
        console.log(`[NEXUS] Duplicate/novelty skipped: ${skippedDuplicatesCount}`);
        console.log(`[NEXUS] Published: 1 (Post ID: ${newPost.id})`);
        console.log(`[NEXUS] Cycle completed in ${durationMs}ms`);

        const result: TickResult = {
          cycleId,
          timestamp: startedAt,
          startedAt,
          completedAt,
          durationMs,
          status: 'published',
          discoveredCount,
          evaluatedCount,
          acceptedCount,
          rejectedCount,
          skippedDuplicatesCount,
          publishedPostId: newPost.id,
          publishedPost: newPost,
          rejections,
        };

        await this.store.recordTickMetrics(result);
        return result;
      } catch (genErr: any) {
        console.error(`[NEXUS] Post generation error for "${candidate.title}": ${genErr.message || String(genErr)}`);
        rejectedCount++;
        rejections.push({
          title: candidate.title,
          reason: `Generation failed: ${genErr.message || String(genErr)}`,
        });
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    console.log(`[NEXUS] Rejected: ${rejectedCount}`);
    console.log(`[NEXUS] Accepted: ${acceptedCount}`);
    console.log(`[NEXUS] Duplicate/novelty skipped: ${skippedDuplicatesCount}`);
    console.log(`[NEXUS] Published: 0`);
    console.log(`[NEXUS] Cycle completed in ${durationMs}ms`);

    const result: TickResult = {
      cycleId,
      timestamp: startedAt,
      startedAt,
      completedAt,
      durationMs,
      status: 'all_rejected',
      discoveredCount,
      evaluatedCount,
      acceptedCount,
      rejectedCount,
      skippedDuplicatesCount,
      rejections,
    };

    await this.store.recordTickMetrics(result);
    return result;
  }
}
