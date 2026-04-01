import type { Message } from './types.js';
import type { ToolDefinition } from './tools/index.js';

export interface ModelProvider {
  name(): string;
  stream(request: ModelRequest): Promise<AsyncGenerator<ProviderEvent>>;
}

export interface ModelRequest {
  model: string;
  system?: string;
  messages: Message[];
  maxTokens: number;
  tools?: ToolDefinition[];
}

export type ProviderEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'content_block_start'; content: ProviderContentBlock }
  | { type: 'input_json_delta'; index: number; partial_json: string }
  | { type: 'message_stop'; stop_reason: string; usage: { input_tokens: number; output_tokens: number } };

export type ProviderContentBlock =
  | { type: 'text' }
  | { type: 'tool_use'; id: string; name: string };


