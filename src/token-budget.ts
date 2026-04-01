import { TokenBudget } from './types.js';

export function createTokenBudget(
  contextWindow: number = 200_000,
  maxOutputTokens: number = 16_000,
  compactThreshold: number = 0.8
): TokenBudget {
  return {
    contextWindow,
    maxOutputTokens,
    compactThreshold,
    inputBudget() {
      return this.contextWindow - this.maxOutputTokens;
    },
    shouldCompact(currentTokens: number): boolean {
      return currentTokens > this.inputBudget() * this.compactThreshold;
    }
  };
}

export function estimateTokens(text: string): number {
  // Rough estimation: ~4 chars per token for English, ~2 for Chinese
  let count = 0;
  for (const char of text) {
    count += char.charCodeAt(0) > 127 ? 2 : 0.25;
  }
  return Math.ceil(count);
}
