import { AgentPersonaData, Post, TickMetrics } from '../persistence/types.js';

export interface InitResult {
  agentId: string;
}

export interface FeedResponse {
  posts: Post[];
}

export interface TickResult extends TickMetrics {
  startedAt: string;
  completedAt: string;
  rejections?: Array<{ title: string; reason: string }>;
  publishedPost?: Post;
}

export interface AgentService {
  initialize(persona: AgentPersonaData): Promise<InitResult>;
  getFeed(): Promise<FeedResponse>;
  runAutonomousCycle(): Promise<TickResult>;
  isInitialized(): Promise<boolean>;
}
