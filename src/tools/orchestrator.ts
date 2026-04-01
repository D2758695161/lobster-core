import { Tool, ToolContext, ToolOutput } from './tool.js';
import { ToolRegistry } from './registry.js';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolCallResult {
  tool_use_id: string;
  output: ToolOutput;
}

export class ToolOrchestrator {
  constructor(private registry: ToolRegistry) {}

  /**
   * 批量执行工具调用。
   * 核心策略：只读工具可并发执行，突变工具需顺序执行。
   */
  async executeBatch(
    calls: ToolCall[],
    ctx: ToolContext
  ): Promise<ToolCallResult[]> {
    // Partition: concurrent (read-only) vs sequential (mutating)
    const concurrent = calls.filter(call => {
      const tool = this.registry.get(call.name);
      return tool?.isReadOnly() ?? false;
    });

    const sequential = calls.filter(call => {
      const tool = this.registry.get(call.name);
      return !(tool?.isReadOnly() ?? false);
    });

    const results: ToolCallResult[] = [];

    // Execute concurrent tools in parallel
    if (concurrent.length > 0) {
      const futures = concurrent.map(call => this.executeSingle(call, ctx));
      const concurrentResults = await Promise.all(futures);
      results.push(...concurrentResults);
    }

    // Execute sequential tools one by one
    for (const call of sequential) {
      const result = await this.executeSingle(call, ctx);
      results.push(result);
    }

    return results;
  }

  async executeSingle(call: ToolCall, ctx: ToolContext): Promise<ToolCallResult> {
    const tool = this.registry.get(call.name);

    if (!tool) {
      return {
        tool_use_id: call.id,
        output: ToolOutput.error(`Unknown tool: ${call.name}`),
      };
    }

    try {
      const output = await tool.execute(ctx, call.input);
      return { tool_use_id: call.id, output };
    } catch (e) {
      return {
        tool_use_id: call.id,
        output: ToolOutput.error(`Tool execution failed: ${e}`),
      };
    }
  }
}
