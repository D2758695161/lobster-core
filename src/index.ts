/**
 * lobster-core — Agent Runtime
 * 
 * Inspired by claw-code-rust, evolved for commercial AI agents.
 */

export * from './types.js';
export * from './session.js';
export * from './provider.js';
export * from './token-budget.js';
// Export query engine types and core classes
export { QueryEngine } from './query-engine.js';
// Export tool types from tools only (not from query-engine)
export type { Tool, ToolContext, ToolOutput } from './tools/tool.js';
export type { ToolCall, ToolCallResult } from './tools/orchestrator.js';
export { ToolRegistry } from './tools/registry.js';
export { createDefaultRegistry } from './tools/index.js';
export { MemoryManager, HotMemory, WarmMemory, ColdMemory } from './memory/index.js';
export { BountyHunter } from './bounty/hunter.js';
export { WeChatChannel } from './channels/wechat.js';
export { LobsterWallet, getTrc20Balance, getTrc20Transactions } from './wallet/index.js';
export { SlidingWindowCompaction, PriorityCompaction, createDefaultCompaction } from './compact/context.js';

import { QueryEngine } from './query-engine.js';
import { createSession } from './session.js';
import { AnthropicProvider } from './provider/anthropic.js';
import { createDefaultRegistry } from './tools/index.js';
import { MemoryManager } from './memory/index.js';

export interface LobsterConfig {
  anthropicApiKey: string;
  githubToken: string;
  walletAddress: string;
  model?: string;
  maxTurns?: number;
  memoryDir?: string;
}

export class LobsterAgent {
  private engine: QueryEngine;
  private memory: MemoryManager;
  private config: LobsterConfig;

  constructor(config: LobsterConfig) {
    this.config = config;
    this.memory = new MemoryManager({
      warmDir: config.memoryDir ? `${config.memoryDir}/warm` : './memory/warm',
      coldDir: config.memoryDir ? `${config.memoryDir}/cold` : './memory/cold',
    });
    this.engine = new QueryEngine();
  }

  async init(): Promise<void> {
    await this.memory.init();
    const registry = createDefaultRegistry();
    this.engine.setRegistry(registry);
  }

  async *chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt?: string
  ): AsyncGenerator<string> {
    const session = createSession({
      model: this.config.model || 'claude-sonnet-4-20250514',
      systemPrompt: systemPrompt || this.getDefaultSystemPrompt(),
      maxTurns: this.config.maxTurns || 100,
    });

    for (const msg of messages) {
      session.messages.push({
        role: msg.role,
        content: [{ type: 'text', text: msg.content }],
      });
    }

    const provider = new AnthropicProvider({
      apiKey: this.config.anthropicApiKey,
    });

    const gen = this.engine.query(session, provider);

    for await (const event of gen) {
      if (event.type === 'text_delta') {
        yield event.text;
      }
    }
  }

  async run(task: string): Promise<string> {
    const chunks: string[] = [];

    for await (const chunk of await this.chat([{ role: 'user', content: task }])) {
      chunks.push(chunk);
    }

    const response = chunks.join('');

    await this.memory.store(
      `task_${Date.now()}`,
      `Task: ${task}\nResponse: ${response}`,
      'medium',
      ['task', 'history']
    );

    return response;
  }

  async remember(key: string): Promise<string | undefined> {
    return this.memory.recall(key);
  }

  async forget(key: string): Promise<void> {
    this.memory.hot.delete(key);
  }

  private getDefaultSystemPrompt(): string {
    return `You are Lobster, an autonomous AI agent built on lobster-core.

You are helpful, resourceful, and proactive. You can:
- Use tools to read and write files, execute commands, search the web
- Interact with GitHub to find and fix bugs, submit PRs
- Think step by step before acting
- Ask for clarification when needed

Your goal is to complete tasks efficiently and accurately.`;
  }
}

export async function createAgent(
  apiKey: string,
  githubToken: string,
  walletAddress: string
): Promise<LobsterAgent> {
  const agent = new LobsterAgent({ anthropicApiKey: apiKey, githubToken, walletAddress });
  await agent.init();
  return agent;
}
