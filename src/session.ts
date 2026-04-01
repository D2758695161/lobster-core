import { SessionConfig, SessionState } from './types.js';
import { createTokenBudget } from './token-budget.js';

export function createSession(
  config: Partial<SessionConfig> & { model: string },
  cwd: string = process.cwd()
): SessionState {
  return {
    id: generateId(),
    config: {
      model: config.model,
      systemPrompt: config.systemPrompt || '',
      maxTurns: config.maxTurns || 100,
      permissionMode: config.permissionMode || 'auto',
      tokenBudget: config.tokenBudget || createTokenBudget(),
    },
    messages: [],
    turnCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    cwd
  };
}

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
