export interface AgentPersonaData {
  name: string;
  domain: string;
}

export interface TickMetrics {
  cycleId: string;
  timestamp: string;
  durationMs: number;
  discoveredCount: number;
  evaluatedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  skippedDuplicatesCount: number;
  status: string;
  publishedPostId?: string;
  error?: string;
}

export interface AgentState {
  initialized: boolean;
  agentId: string | null;
  persona: AgentPersonaData | null;
  initializedAt: string | null;
  lastRunAt: string | null;
  lastTickMetrics?: TickMetrics | null;
}

export interface Post {
  id: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
}

export interface PersistenceStore {
  getAgentState(): Promise<AgentState>;
  setAgentState(state: AgentState): Promise<void>;
  getPosts(): Promise<Post[]>;
  addPost(post: Post): Promise<void>;
  hasSeenTopic(topicIdOrUrl: string): Promise<boolean>;
  markTopicSeen(topicIdOrUrl: string): Promise<void>;
  recordTickMetrics(metrics: TickMetrics): Promise<void>;
  clearAll?(): Promise<void>;
}
