import { DiscoveredTopic } from '../discovery/types.js';
import { EditorialDecision, EditorialJudge } from './types.js';
import { NEXUS_PERSONA } from '../persona/nexus.js';

export class NexusEditorialJudge implements EditorialJudge {
  private threshold: number;

  constructor(threshold = 0.65) {
    this.threshold = threshold;
  }

  async evaluateTopic(
    topic: DiscoveredTopic,
    publishedHistory: string[] = []
  ): Promise<EditorialDecision> {
    const textToAnalyze = `${topic.title} ${topic.summary}`.toLowerCase();
    const evaluatedAt = new Date().toISOString();

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const reasons: string[] = [];
    let score = 0.5; // Neutral baseline

    // 1. Technical Signal Keywords (Engineering Consequences)
    const techKeywords = [
      'inference',
      'latency',
      'quantization',
      'vllm',
      'architecture',
      'benchmark',
      'kernel',
      'cuda',
      'checkpoint',
      'fine-tuning',
      'finetuning',
      'eval',
      'speculative decoding',
      'kv cache',
      'throughput',
      'moe',
      'mixture-of-experts',
      'flashattention',
      'context window',
      'distributed',
      'compiler',
      'onnx',
      'tensorrt',
      'rag',
      'retrieval',
      'agentic',
      'open-source',
      'open source',
      'security vulnerability',
      'jailbreak',
      'model weights',
    ];

    let techMatches = 0;
    for (const kw of techKeywords) {
      if (textToAnalyze.includes(kw)) {
        techMatches++;
      }
    }

    if (techMatches > 0) {
      const techBonus = Math.min(0.35, techMatches * 0.1);
      score += techBonus;
      strengths.push(`High technical density (${techMatches} engineering signals detected)`);
    } else {
      score -= 0.2;
      weaknesses.push('Low technical keyword density; potential surface-level news');
    }

    // 2. Rejection Triggers (Hype, Marketing, Off-Domain)
    const hypeKeywords = [
      'launches feature',
      'launches new',
      'game changer',
      'game-changer',
      'revolutionary',
      'will replace',
      'funding round',
      'raised $',
      'raises $',
      'valuation',
      'partnership with',
      'waitlist',
      'teaser',
      'celebrity',
      'crypto',
      'nft',
      'meme',
      'social app',
    ];

    let matchedRejection: string | undefined;
    for (const kw of hypeKeywords) {
      if (textToAnalyze.includes(kw)) {
        matchedRejection = kw;
        // If technical density is high, apply a milder penalty (-0.2); if tech signals are absent, penalize heavily (-0.45)
        const penalty = techMatches >= 2 ? 0.2 : 0.45;
        score -= penalty;
        weaknesses.push(`Matches hype/marketing phrase "${kw}" (penalty: -${penalty})`);
        break;
      }
    }

    // 3. Source Quality Check
    if (topic.sourceType === 'arxiv') {
      score += 0.2;
      strengths.push('Primary scientific source (arXiv research paper)');
    } else if (topic.sourceType === 'github_release') {
      score += 0.2;
      strengths.push('Direct technical release source (GitHub repository)');
    } else if (topic.sourceType === 'huggingface') {
      score += 0.1;
      strengths.push('Reputable open ML ecosystem source (Hugging Face)');
    }

    // 4. Focus Domain Matching
    let matchedFocus: string | undefined;
    for (const focus of NEXUS_PERSONA.focusTopics) {
      const mainTerm = focus.split('(')[0].trim().toLowerCase();
      if (textToAnalyze.includes(mainTerm)) {
        matchedFocus = focus;
        score += 0.15;
        strengths.push(`Aligns directly with NEXUS focus area: "${focus}"`);
        break;
      }
    }

    // 5. Freshness Scoring
    const pubTime = new Date(topic.publishedAt).getTime();
    const nowTime = new Date().getTime();
    const ageHours = (nowTime - pubTime) / (1000 * 60 * 60);

    if (ageHours <= 48 && ageHours >= 0) {
      score += 0.15;
      strengths.push(`Fresh publication (${Math.round(ageHours)} hours old)`);
    } else if (ageHours > 720) {
      // > 30 days
      score -= 0.25;
      weaknesses.push(`Stale publication (${Math.round(ageHours / 24)} days old)`);
    }

    // 6. History Overlap Check
    const titleTokens = topic.title.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    for (const hist of publishedHistory) {
      const histLower = hist.toLowerCase();
      let matchCount = 0;
      for (const token of titleTokens) {
        if (histLower.includes(token)) matchCount++;
      }
      if (titleTokens.length > 0 && matchCount / titleTokens.length > 0.6) {
        score -= 0.65;
        weaknesses.push('Substantial overlap with previously published NEXUS post');
        break;
      }
    }

    // Clamp score to [0.0, 1.0]
    score = Math.max(0.0, Math.min(1.0, parseFloat(score.toFixed(2))));

    const decision = score >= this.threshold ? 'ACCEPT' : 'REJECT';

    if (decision === 'ACCEPT') {
      reasons.push(
        `Accepted with signal score ${score}: Strong technical relevance to AI engineering and high evidence quality.`
      );
    } else {
      reasons.push(
        `Rejected with signal score ${score} (below threshold ${this.threshold}): ${
          weaknesses.join('; ') || 'Fails NEXUS signal-over-hype editorial standards.'
        }`
      );
    }

    return {
      topicId: topic.id,
      decision,
      score,
      reasons,
      strengths,
      weaknesses,
      matchedFocus,
      matchedRejection,
      evaluatedAt,
    };
  }
}
