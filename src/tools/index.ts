export { Tool, ToolContext, ToolOutput } from './tool.js';
export { ToolRegistry, type ToolDefinition } from './registry.js';
export { ToolOrchestrator, ToolCall, ToolCallResult } from './orchestrator.js';
export { BashTool } from './bash.js';
export { FileReadTool } from './file-read.js';
export { FileWriteTool } from './file-write.js';
export { GrepTool } from './grep.js';
export { GitHubTool } from './github.js';

import { ToolRegistry } from './registry.js';
import { BashTool } from './bash.js';
import { FileReadTool } from './file-read.js';
import { FileWriteTool } from './file-write.js';
import { GrepTool } from './grep.js';
import { GitHubTool } from './github.js';

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new BashTool());
  registry.register(new FileReadTool());
  registry.register(new FileWriteTool());
  registry.register(new GrepTool());
  registry.register(new GitHubTool(process.env.GITHUB_TOKEN));
  return registry;
}
