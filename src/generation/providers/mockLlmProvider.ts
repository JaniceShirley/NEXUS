import { z } from 'zod';
import { LlmProvider } from '../types.js';

export class MockLlmProvider implements LlmProvider {
  name = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async generateJson<T>(prompt: string, systemPrompt: string, schema: z.ZodType<T>): Promise<T> {
    const titleMatch = prompt.match(/Title:\s*(.+)/i);
    const title = titleMatch ? titleMatch[1].trim() : 'AI Engineering Breakthrough';

    const mockResponse = {
      text: `NEXUS Technical Analysis: The implementation described in "${title}" represents a tangible engineering step in model inference and systems architecture. Rather than relying on speculative announcements, the benchmark performance demonstrates how optimizing KV cache allocation and kernel execution directly improves throughput under high concurrent load. For AI engineers, the primary takeaway is the reduction in memory overhead per token, enabling higher batch sizes on existing hardware clusters.`,
      rationale: `Selected "${title}" because it provides concrete engineering benchmarks rather than marketing hype. It is relevant now as LLM serving costs scale, and passed NEXUS editorial standards for technical signal over promotional claims.`,
    };

    return schema.parse(mockResponse);
  }
}
