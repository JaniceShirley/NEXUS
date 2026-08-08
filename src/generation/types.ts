import { z } from 'zod';
import { DiscoveredTopic } from '../discovery/types.js';
import { EditorialDecision } from '../editorial/types.js';

export const GeneratedPostSchema = z.object({
  text: z.string().min(50).max(1500),
  rationale: z.string().min(30),
});

export type GeneratedPost = z.infer<typeof GeneratedPostSchema>;

export interface PostDraft {
  text: string;
  rationale: string;
  sources: string[];
}

export interface LlmProvider {
  name: string;
  isAvailable(): boolean;
  generateJson<T>(prompt: string, systemPrompt: string, schema: z.ZodType<T>): Promise<T>;
}

export interface ContentGenerator {
  generatePost(topic: DiscoveredTopic, decision: EditorialDecision): Promise<PostDraft>;
}
