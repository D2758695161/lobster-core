import { Tool, ToolContext, ToolOutput } from './tool.js';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  async executeBatch(
    calls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    ctx: ToolContext
  ): Promise<Array<{ tool_use_id: string; output: ToolOutput }>> {
    // Partition into concurrent (read-only) and sequential (mutating)
    const { ToolOrchestrator } = require('./orchestrator.js');
    const orchestrator = new ToolOrchestrator(this);
    return orchestrator.executeBatch(calls, ctx);
  }
}
