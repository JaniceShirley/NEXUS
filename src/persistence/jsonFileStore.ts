import fs from 'fs';
import path from 'path';
import { AgentState, PersistenceStore, Post, TickMetrics } from './types.js';

interface StorageSchema {
  agentState: AgentState;
  posts: Post[];
  seenTopics: string[];
  tickMetricsHistory: TickMetrics[];
}

const DEFAULT_STATE: AgentState = {
  initialized: false,
  agentId: null,
  persona: null,
  initializedAt: null,
  lastRunAt: null,
  lastTickMetrics: null,
};

export class JsonFileStore implements PersistenceStore {
  private filePath: string;
  private cache: StorageSchema;

  constructor(dataDir: string) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, 'nexus-store.json');
    this.cache = this.load();
  }

  private load(): StorageSchema {
    if (!fs.existsSync(this.filePath)) {
      const initialData: StorageSchema = {
        agentState: DEFAULT_STATE,
        posts: [],
        seenTopics: [],
        tickMetricsHistory: [],
      };
      this.saveSync(initialData);
      return initialData;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StorageSchema>;
      return {
        agentState: parsed.agentState || DEFAULT_STATE,
        posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        seenTopics: Array.isArray(parsed.seenTopics) ? parsed.seenTopics : [],
        tickMetricsHistory: Array.isArray(parsed.tickMetricsHistory) ? parsed.tickMetricsHistory : [],
      };
    } catch (err) {
      console.error('[JsonFileStore] Error parsing store file, initializing fresh:', err);
      const fallback: StorageSchema = {
        agentState: DEFAULT_STATE,
        posts: [],
        seenTopics: [],
        tickMetricsHistory: [],
      };
      this.saveSync(fallback);
      return fallback;
    }
  }

  private saveSync(data: StorageSchema): void {
    const tempPath = `${this.filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, this.filePath);
  }

  async getAgentState(): Promise<AgentState> {
    return { ...this.cache.agentState };
  }

  async setAgentState(state: AgentState): Promise<void> {
    this.cache.agentState = { ...state };
    this.saveSync(this.cache);
  }

  async getPosts(): Promise<Post[]> {
    // Newest posts first as required by API contract
    return [...this.cache.posts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async addPost(post: Post): Promise<void> {
    this.cache.posts.push(post);
    this.saveSync(this.cache);
  }

  async hasSeenTopic(topicIdOrUrl: string): Promise<boolean> {
    const normalized = topicIdOrUrl.toLowerCase().trim();
    return this.cache.seenTopics.some((t) => t.toLowerCase().trim() === normalized);
  }

  async markTopicSeen(topicIdOrUrl: string): Promise<void> {
    const normalized = topicIdOrUrl.toLowerCase().trim();
    if (!await this.hasSeenTopic(normalized)) {
      this.cache.seenTopics.push(normalized);
      this.saveSync(this.cache);
    }
  }

  async recordTickMetrics(metrics: TickMetrics): Promise<void> {
    this.cache.agentState.lastTickMetrics = metrics;
    this.cache.tickMetricsHistory.push(metrics);
    // Keep max 50 recent metric entries
    if (this.cache.tickMetricsHistory.length > 50) {
      this.cache.tickMetricsHistory = this.cache.tickMetricsHistory.slice(-50);
    }
    this.saveSync(this.cache);
  }

  async clearAll(): Promise<void> {
    this.cache = {
      agentState: DEFAULT_STATE,
      posts: [],
      seenTopics: [],
      tickMetricsHistory: [],
    };
    this.saveSync(this.cache);
  }
}
