import { Anthropic } from '@anthropic-ai/sdk';
import type { ModelProvider, ModelRequest, ProviderEvent } from '../provider.js';

export interface AnthropicConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicProvider implements ModelProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: AnthropicConfig) {
    const options: { apiKey: string; baseURL?: string } = {
      apiKey: config.apiKey,
    };
    if (config.baseURL) {
      options.baseURL = config.baseURL;
    }

    this.client = new Anthropic(options);
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 8192;
  }

  name(): string {
    return 'anthropic';
  }

  async stream(request: ModelRequest): Promise<AsyncGenerator<ProviderEvent>> {
    // Convert our Message format to Anthropic SDK format
    const anthropicMessages: Array<{
      role: 'user' | 'assistant';
      content: string | Array<Record<string, unknown>>;
    }> = [];

    for (const msg of request.messages) {
      const blocks: Array<Record<string, unknown>> = [];

      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          blocks.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use' && block.id && block.name) {
          blocks.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input || {},
          });
        } else if (block.type === 'tool_result') {
          blocks.push({
            type: 'tool_result',
            tool_use_id: block.tool_use_id || '',
            content: block.content || '',
            is_error: block.is_error || false,
          });
        }
      }

      anthropicMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: blocks,
      });
    }

    // Build tools array if provided
    let tools: undefined | Array<Record<string, unknown>> = undefined;

    if (request.tools && request.tools.length > 0) {
      tools = request.tools.map((t) => {
        const schema = t.input_schema as Record<string, unknown> || {};
        if (!schema.type) schema.type = 'object';
        if (!schema.properties) schema.properties = {};
        return {
          name: t.name,
          description: t.description,
          input_schema: schema,
        };
      });
    }

    const system = request.system;
    const model = request.model || this.model;
    const maxTokens = request.maxTokens || this.maxTokens;

    // Stream the response
    const response = this.client.messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      messages: anthropicMessages as any,
      tools: tools as any,
    });

    // Return async generator that maps Anthropic events to our format
    async function* eventGen(): AsyncGenerator<ProviderEvent> {
      for await (const event of response) {
        const ev = event as unknown as Record<string, unknown>;
        const evType = ev.type as string;

        if (evType === 'content_block_start') {
          const block = ev.content_block as Record<string, unknown>;
          if (block.type === 'tool_use') {
            yield {
              type: 'content_block_start',
              content: {
                type: 'tool_use',
                id: block.id as string,
                name: block.name as string,
              },
            };
          }
        } else if (evType === 'content_block_delta') {
          const delta = ev.delta as Record<string, unknown>;
          if (delta.type === 'text_delta') {
            yield { type: 'text_delta', text: delta.text as string };
          } else if (delta.type === 'input_json_delta') {
            yield {
              type: 'input_json_delta',
              index: 0,
              partial_json: delta.partial_json as string,
            };
          }
        } else if (evType === 'message_stop') {
          yield {
            type: 'message_stop',
            stop_reason: 'end_turn',
            usage: { input_tokens: 0, output_tokens: 0 },
          };
        }
      }
    }

    return eventGen();
  }
}
