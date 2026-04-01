/**
 * lobster-core Tests
 */

import { describe, it, expect } from 'vitest';
import { createTokenBudget } from '../token-budget.js';
import { HotMemory, WarmMemory } from '../memory/index.js';
import { SlidingWindowCompaction } from '../compact/context.js';
import { LobsterWallet, parseAddress } from '../wallet/index.js';
import { ToolRegistry } from '../tools/registry.js';
import { BashTool, FileReadTool } from '../tools/index.js';

describe('TokenBudget', () => {
  it('should calculate input budget correctly', () => {
    const budget = createTokenBudget(200_000, 16_000);
    expect(budget.inputBudget()).toBe(184_000);
  });

  it('should trigger compaction at threshold', () => {
    const budget = createTokenBudget(200_000, 16_000, 0.8);
    expect(budget.shouldCompact(180_000)).toBe(true);
    expect(budget.shouldCompact(140_000)).toBe(false);
  });
});

describe('HotMemory', () => {
  it('should store and retrieve values', () => {
    const mem = new HotMemory(10, 'test');
    mem.set('key1', 'value1', 'medium');
    expect(mem.get('key1')).toBe('value1');
    expect(mem.has('key1')).toBe(true);
  });

  it('should evict LRU items when full', () => {
    const mem = new HotMemory(3, 'test');
    mem.set('k1', 'v1', 'medium');
    mem.set('k2', 'v2', 'medium');
    mem.set('k3', 'v3', 'medium');
    mem.set('k4', 'v4', 'low'); // Should evict k1

    expect(mem.size()).toBeLessThanOrEqual(3);
  });

  it('should query by tags', () => {
    const mem = new HotMemory(10, 'test');
    mem.set('task1', 'do something', 'high', ['task', 'urgent']);
    mem.set('task2', 'do other', 'medium', ['task']);

    const results = mem.query({ tags: ['urgent'] });
    expect(results.length).toBe(1);
    expect(results[0].value).toBe('do something');
  });
});

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry();
    registry.register(new BashTool());
    registry.register(new FileReadTool());

    const tools = registry.getToolDefinitions();
    expect(tools.length).toBe(2);
    expect(tools.find(t => t.name === 'bash')).toBeDefined();
    expect(tools.find(t => t.name === 'file_read')).toBeDefined();
  });

  it('should throw on duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(new BashTool());
    expect(() => registry.register(new BashTool())).toThrow();
  });
});

describe('SlidingWindowCompaction', () => {
  it('should not compact small conversations', () => {
    const strategy = new SlidingWindowCompaction(10, 100_000);
    const messages = [
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'hello' }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'hi' }] },
    ];

    const result = strategy.compact(messages);
    expect(result.compacted.length).toBe(2);
    expect(result.tokensRemoved).toBe(0);
  });

  it('should compact large conversations', () => {
    const strategy = new SlidingWindowCompaction(3, 100_000);
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: [{ type: 'text' as const, text: `message ${i}` }],
    }));

    const result = strategy.compact(messages);
    expect(result.compacted.length).toBeLessThan(10);
    expect(result.tokensRemoved).toBeGreaterThan(0);
  });
});

describe('Wallet', () => {
  it('should parse TRC20 addresses', () => {
    expect(parseAddress('TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9')).toBe('TRC20');
  });

  it('should parse ERC20 addresses', () => {
    expect(parseAddress('0xaae0101ac77a2e4e0ea826eb4d309374f029b0a6')).toBe('ERC20');
  });
});
