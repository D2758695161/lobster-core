import { EventEmitter } from 'events';
import type {
  QueryEvent, SessionState, ContentBlock
} from './types.js';
import type { ModelProvider } from './provider.js';
import type { ToolRegistry, ToolCall, ToolContext, ToolDefinition } from './tools/index.js';

export class QueryEngine extends EventEmitter {
  private registry: ToolRegistry | null = null;

  setRegistry(registry: ToolRegistry) {
    this.registry = registry;
  }

  async *query(
    session: SessionState,
    provider: ModelProvider,
  ): AsyncGenerator<QueryEvent> {
    while (true) {
      if (session.turnCount >= session.config.maxTurns) {
        throw new Error(`Max turns ${session.config.maxTurns} exceeded`);
      }

      session.turnCount++;

      const request = {
        model: session.config.model,
        system: session.config.systemPrompt || undefined,
        messages: session.messages,
        maxTokens: session.config.tokenBudget.maxOutputTokens,
        tools: this.registry?.getToolDefinitions()
      };

      const stream = await provider.stream(request);
      let assistantText = '';
      let toolUses: Array<{ id: string; name: string; json: string }> = [];
      let stopReason: string | null = null;

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            assistantText += event.text;
            yield { type: 'text_delta', text: event.text };
            break;

          case 'content_block_start':
            if (event.content.type === 'tool_use') {
              toolUses.push({
                id: event.content.id,
                name: event.content.name,
                json: ''
              });
              yield { type: 'tool_use_start', id: event.content.id, name: event.content.name };
            }
            break;

          case 'input_json_delta':
            if (toolUses.length > 0) {
              toolUses[toolUses.length - 1].json += event.partial_json;
            }
            break;

          case 'message_stop':
            stopReason = event.stop_reason;
            break;
        }
      }

      const assistantContent: ContentBlock[] = [];
      if (assistantText) {
        assistantContent.push({ type: 'text', text: assistantText });
      }

      const toolCalls: ToolCall[] = toolUses.map(tu => {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tu.json);
        } catch {
          // ignore parse errors
        }

        assistantContent.push({
          type: 'tool_use',
          id: tu.id,
          name: tu.name,
          input
        });

        return { id: tu.id, name: tu.name, input };
      });

      session.messages.push({ role: 'assistant', content: assistantContent });

      if (toolCalls.length === 0) {
        yield { type: 'turn_complete', stop_reason: (stopReason as any) || 'end_turn' };
        return;
      }

      if (!this.registry) {
        throw new Error('Tool registry not set');
      }

      const ctx: ToolContext = { cwd: session.cwd, sessionId: session.id };
      const results = await this.registry.executeBatch(toolCalls, ctx);

      const resultContent: ContentBlock[] = results.map(r => ({
        type: 'tool_result' as const,
        tool_use_id: r.tool_use_id,
        content: r.output.content,
        is_error: r.output.isError
      }));

      session.messages.push({ role: 'user', content: resultContent });
    }
  }
}

// Re-export tool types for consumers
export type { ToolRegistry, ToolCall, ToolContext, ToolDefinition } from './tools/index.js';
