// Event types (from claw-code-rust QueryEvent)
export type QueryEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }
  | { type: 'turn_complete'; stop_reason: StopReason }
  | { type: 'usage'; input_tokens: number; output_tokens: number }
  | { type: 'thinking'; content: string };

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

export type Role = 'user' | 'assistant' | 'system';

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  tool_use_id?: string;
  is_error?: boolean;
}

export interface Message {
  role: Role;
  content: ContentBlock[];
}

export interface SessionConfig {
  model: string;
  systemPrompt: string;
  maxTurns: number;
  permissionMode: 'auto' | 'interactive' | 'deny';
  tokenBudget: TokenBudget;
}

export interface TokenBudget {
  contextWindow: number;
  maxOutputTokens: number;
  compactThreshold: number; // 0.8 default

  inputBudget(): number;
  shouldCompact(currentTokens: number): boolean;
}

export interface SessionState {
  id: string;
  config: SessionConfig;
  messages: Message[];
  turnCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cwd: string;
}
