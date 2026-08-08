import { z } from 'zod';
import { LlmProvider } from '../types.js';
import { config } from '../../config/env.js';

export class GeminiLlmProvider implements LlmProvider {
  name = 'gemini';
  private apiKey: string;
  private modelName: string;

  constructor(
    apiKey = config.geminiApiKey,
    modelName = config.geminiModel
  ) {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getModelName(): string {
    return this.modelName;
  }

  async generateJson<T>(prompt: string, systemPrompt: string, schema: z.ZodType<T>): Promise<T> {
    if (!this.isAvailable()) {
      throw new Error(
        '[GeminiLlmProvider] Production LLM generation requested, but no GEMINI_API_KEY or GOOGLE_API_KEY is configured in environment.'
      );
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${systemPrompt}\n\nTask:\n${prompt}\n\nProvide response strictly as valid JSON adhering to the required schema.`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[GeminiLlmProvider] Gemini API error HTTP ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as any;
    const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!jsonText) {
      throw new Error('[GeminiLlmProvider] Gemini API returned empty or missing content part.');
    }

    const parsedJson = JSON.parse(jsonText);
    return schema.parse(parsedJson);
  }
}
