/**
 * Context Compaction — from claw-code-rust's compact crate
 * 
 * When the conversation gets too long, we need to compact it.
 * This preserves the most important context while reducing token count.
 */

import type { Message, ContentBlock } from '../types.js';

export interface CompactionStrategy {
  /**
   * Should we compact given the current message count and token estimate?
   */
  shouldCompact(messageCount: number, estimatedTokens: number): boolean;

  /**
   * Compact a list of messages into a shorter summary
   */
  compact(messages: Message[]): CompactionResult;
}

export interface CompactionResult {
  compacted: Message[];       // The new, shorter message list
  summary: string;              // What was removed (for the model to know)
  tokensRemoved: number;       // Estimated tokens removed
  tokensRemaining: number;      // Estimated tokens remaining
}

/**
 * Simple compaction: keep recent N messages, summarize the rest
 */
export class SlidingWindowCompaction implements CompactionStrategy {
  private windowSize: number;
  private maxTokens: number;
  private tokensPerMessage: number; // rough estimate

  constructor(windowSize = 20, maxTokens = 100_000) {
    this.windowSize = windowSize;
    this.maxTokens = maxTokens;
    this.tokensPerMessage = 500; // rough average
  }

  shouldCompact(messageCount: number, estimatedTokens: number): boolean {
    return messageCount > this.windowSize || estimatedTokens > this.maxTokens;
  }

  compact(messages: Message[]): CompactionResult {
    if (messages.length <= this.windowSize) {
      return {
        compacted: messages,
        summary: '',
        tokensRemoved: 0,
        tokensRemaining: this.estimateTokens(messages),
      };
    }

    // Keep the last N messages (most recent context)
    const kept = messages.slice(-this.windowSize);
    const removed = messages.slice(0, -this.windowSize);

    // Summarize what was removed
    const summary = this.summarizeRemoved(removed);

    const newMessage: Message = {
      role: 'system',
      content: [
        {
          type: 'text',
          text: `[Previous conversation summarized (${removed.length} messages removed): ${summary}]`,
        },
      ],
    };

    return {
      compacted: [newMessage, ...kept],
      summary: summary,
      tokensRemoved: this.estimateTokens(removed),
      tokensRemaining: this.estimateTokens(kept) + 200, // ~200 for the summary
    };
  }

  private summarizeRemoved(messages: Message[]): string {
    if (messages.length === 0) return '';

    // Simple summarization: extract key topics from tool calls and results
    const topics: string[] = [];
    const toolCalls: string[] = [];

    for (const msg of messages) {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && block.name) {
          toolCalls.push(block.name);
        }
        if (block.type === 'text' && block.text) {
          // Extract first 100 chars of each text block
          const preview = block.text.slice(0, 100).replace(/\n/g, ' ');
          topics.push(preview);
        }
      }
    }

    const uniqueTools = [...new Set(toolCalls)].slice(0, 5);
    const uniqueTopics = [...new Set(topics)].slice(0, 3);

    return [
      uniqueTools.length > 0 ? `Tools used: ${uniqueTools.join(', ')}` : '',
      uniqueTopics.length > 0 ? `Topics discussed: ${uniqueTopics.join('; ')}` : '',
      `${messages.length} messages total`,
    ]
      .filter(Boolean)
      .join('. ');
  }

  private estimateTokens(messages: Message[]): number {
    // Rough estimation
    return messages.reduce((sum, msg) => {
      const textLength = msg.content.reduce((t, b) => t + (b.text?.length || 0), 0);
      return sum + Math.ceil(textLength / 4);
    }, 0);
  }
}

/**
 * Priority compaction: keeps messages with high information density
 */
export class PriorityCompaction implements CompactionStrategy {
  private keepTools: boolean;
  private keepUserMessages: boolean;

  constructor(options: { keepTools?: boolean; keepUserMessages?: boolean } = {}) {
    this.keepTools = options.keepTools ?? true;
    this.keepUserMessages = options.keepUserMessages ?? true;
  }

  shouldCompact(messageCount: number, estimatedTokens: number): boolean {
    return messageCount > 30 || estimatedTokens > 80_000;
  }

  compact(messages: Message[]): CompactionResult {
    const kept: Message[] = [];
    const removed: Message[] = [];

    // Keep system messages and last few exchanges
    const lastN = Math.min(10, messages.length);

    for (let i = 0; i < messages.length - lastN; i++) {
      const msg = messages[i];

      // Always keep system messages
      if (msg.role === 'system') {
        kept.push(msg);
        continue;
      }

      // Check if message has valuable content
      const hasTools = msg.content.some((b) => b.type === 'tool_use' || b.type === 'tool_result');
      const hasText = msg.content.some((b) => b.type === 'text' && b.text && b.text.length > 100);

      const isWorthKeeping = (this.keepTools && hasTools) || (this.keepUserMessages && msg.role === 'user' && hasText);

      if (isWorthKeeping) {
        kept.push(msg);
      } else {
        removed.push(msg);
      }
    }

    // Always keep the last N messages
    kept.push(...messages.slice(-lastN));

    // Sort to maintain chronological order
    kept.sort((a, b) => messages.indexOf(a) - messages.indexOf(b));

    const summary = `${removed.length} messages compacted. ${kept.length} high-priority messages retained.`;

    return {
      compacted: kept,
      summary,
      tokensRemoved: removed.length * 200,
      tokensRemaining: kept.length * 300,
    };
  }
}

/**
 * Default compaction strategy
 */
export function createDefaultCompaction(): CompactionStrategy {
  return new SlidingWindowCompaction(20, 100_000);
}
