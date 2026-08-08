import { describe, it, expect } from 'vitest';
import { MockLlmProvider } from '../src/generation/providers/mockLlmProvider.js';
import { GeminiLlmProvider } from '../src/generation/providers/geminiLlmProvider.js';
import { NexusContentGenerator } from '../src/generation/contentGenerator.js';
import { GeneratedPostSchema } from '../src/generation/types.js';
import { DiscoveredTopic } from '../src/discovery/types.js';
import { EditorialDecision } from '../src/editorial/types.js';

describe('Content Generation & LLM Providers', () => {
  it('MockLlmProvider should generate valid JSON matching GeneratedPostSchema', async () => {
    const provider = new MockLlmProvider();
    expect(provider.isAvailable()).toBe(true);

    const result = await provider.generateJson(
      'Title: vLLM Speculative Decoding\nURL: https://arxiv.org/abs/2408.00001',
      'System prompt',
      GeneratedPostSchema
    );

    expect(result.text).toBeDefined();
    expect(result.text.length).toBeGreaterThan(50);
    expect(result.rationale).toBeDefined();
    expect(result.rationale.length).toBeGreaterThan(30);
  });

  it('NexusContentGenerator should generate valid PostDraft preserving verified candidate source URLs', async () => {
    const mockProvider = new MockLlmProvider();
    const generator = new NexusContentGenerator(mockProvider);

    const topic: DiscoveredTopic = {
      id: 't-gen-1',
      title: 'Quantization Benchmarks on ARM Processors',
      summary: 'Evaluation of 4-bit vs 8-bit quantization latency.',
      url: 'https://huggingface.co/blog/quant-arm',
      publishedAt: new Date().toISOString(),
      sourceName: 'Hugging Face Blog',
      sourceType: 'huggingface',
      discoveredAt: new Date().toISOString(),
    };

    const decision: EditorialDecision = {
      topicId: topic.id,
      decision: 'ACCEPT',
      score: 0.85,
      reasons: ['High technical density'],
      strengths: ['Benchmark evidence'],
      weaknesses: [],
      evaluatedAt: new Date().toISOString(),
    };

    const draft = await generator.generatePost(topic, decision);

    expect(draft.text).toBeDefined();
    expect(draft.rationale).toBeDefined();
    expect(draft.sources).toEqual(['https://huggingface.co/blog/quant-arm']);
  });

  it('GeminiLlmProvider should throw clear configuration error when API key is missing', async () => {
    const unconfiguredGemini = new GeminiLlmProvider('', 'gemini-2.5-flash');
    expect(unconfiguredGemini.isAvailable()).toBe(false);

    await expect(
      unconfiguredGemini.generateJson('Prompt', 'System', GeneratedPostSchema)
    ).rejects.toThrow('no GEMINI_API_KEY or GOOGLE_API_KEY is configured');
  });
});
