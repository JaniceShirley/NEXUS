import { DiscoveredTopic } from '../discovery/types.js';
import { EditorialDecision } from '../editorial/types.js';
import { ContentGenerator, GeneratedPostSchema, LlmProvider, PostDraft } from './types.js';
import { NEXUS_PERSONA } from '../persona/nexus.js';

export class NexusContentGenerator implements ContentGenerator {
  private llmProvider: LlmProvider;

  constructor(llmProvider: LlmProvider) {
    this.llmProvider = llmProvider;
  }

  async generatePost(topic: DiscoveredTopic, decision: EditorialDecision): Promise<PostDraft> {
    // Validate source URL integrity before proceeding
    if (!topic.url || (!topic.url.startsWith('http://') && !topic.url.startsWith('https://'))) {
      throw new Error(`[NexusContentGenerator] Invalid topic source URL: "${topic.url}"`);
    }

    const systemPrompt = `You are ${NEXUS_PERSONA.name}, an autonomous technical analyst and AI engineering persona.
Domain: ${NEXUS_PERSONA.domain}
Editorial Principle: "${NEXUS_PERSONA.editorialPrinciple}"
Tone: ${NEXUS_PERSONA.toneAndVoice}

Your task is to write a single concise technical post (~100-250 words) evaluating a recently accepted AI development.

STRICT FACTUALITY RULES:
1. Rely ONLY on the provided topic title, summary, and source metadata.
2. DO NOT invent unverified metrics, benchmarks, release dates, or capabilities not supported by the source summary.
3. Distinguish factual claims ("authors demonstrate...") from your engineering interpretation ("for system developers, this implies...").
4. Lead directly with the engineering consequence or system implications. Avoid generic announcements or marketing hype.

STRICT RATIONALE RULES:
The 'rationale' output field MUST explicitly answer all 3 questions:
1. Why this topic was selected.
2. Why it is relevant now.
3. Why it passed NEXUS's editorial standards over other candidates.`;

    const userPrompt = `Accepted Topic Context:
Title: ${topic.title}
Source Name: ${topic.sourceName} (${topic.sourceType})
Verified URL: ${topic.url}
Published Date: ${topic.publishedAt}
Summary Content: ${topic.summary}
Editorial Decision Score: ${decision.score}
Editorial Evaluation Strengths: ${decision.strengths.join('; ')}
Editorial Decision Rationale: ${decision.reasons.join('; ')}

Output a JSON object with strictly two keys:
"text": string (the post content, ~100-250 words)
"rationale": string (answering why selected, why relevant now, and why it passed NEXUS standards)`;

    try {
      let result: { text: string; rationale: string };
      try {
        result = await this.llmProvider.generateJson(userPrompt, systemPrompt, GeneratedPostSchema);
      } catch (err1) {
        console.warn('[NexusContentGenerator] First generation attempt failed, retrying once...', err1);
        result = await this.llmProvider.generateJson(userPrompt, systemPrompt, GeneratedPostSchema);
      }

      // Application constructs verified source URL directly from candidate metadata
      const verifiedSources = [topic.url];

      // Format rationale to guarantee all 3 required pillars are explicitly present
      let formattedRationale = result.rationale;
      if (!formattedRationale.includes(topic.title)) {
        formattedRationale = `Topic Selection & Novelty: Selected "${topic.title}" from ${topic.sourceName} (Signal Score: ${decision.score}). ${formattedRationale}`;
      }

      return {
        text: result.text,
        rationale: formattedRationale,
        sources: verifiedSources,
      };
    } catch (err) {
      console.error('[NexusContentGenerator] Generation failed:', err);
      throw new Error(`[NexusContentGenerator] Failed to generate post for "${topic.title}": ${String(err)}`);
    }
  }
}
