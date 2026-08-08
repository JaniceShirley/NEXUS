import { DiscoveredTopic } from '../discovery/types.js';

export type EditorialDecisionType = 'ACCEPT' | 'REJECT';

export interface EditorialDecision {
  topicId: string;
  decision: EditorialDecisionType;
  score: number; // 0.0 to 1.0
  reasons: string[];
  strengths: string[];
  weaknesses: string[];
  matchedFocus?: string;
  matchedRejection?: string;
  evaluatedAt: string;
}

export interface EditorialJudge {
  evaluateTopic(
    topic: DiscoveredTopic,
    publishedHistory: string[]
  ): Promise<EditorialDecision>;
}
