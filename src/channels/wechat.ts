/**
 * WeChat Channel — Connect lobster-core to WeChat via OpenClaw
 * 
 * This channel allows lobster-core to receive and respond to WeChat messages.
 * lobster-core runs as a skill within OpenClaw, which handles the WeChat transport.
 */

export interface WeChatMessage {
  id: string;
  fromUserId: string;
  fromUserName?: string;
  content: string;
  timestamp: number;
  type: 'text' | 'image' | 'voice' | 'file';
}

export interface WeChatConfig {
  // OpenClaw injects these via environment
  openclawSessionId?: string;
  openclawAccountId?: string;
}

/**
 * WeChat Channel — integrates with OpenClaw's WeChat transport
 * 
 * In OpenClaw, messages come in via the agent's message handler.
 * We just need to format responses correctly.
 */
export class WeChatChannel {
  private config: WeChatConfig;
  private sessionId: string;

  constructor(config: WeChatConfig = {}) {
    this.config = config;
    this.sessionId = config.openclawSessionId || 'wechat-default';
  }

  /**
   * Format a message for WeChat display
   */
  formatTextMessage(text: string): string {
    // WeChat supports basic markdown-like formatting
    // Bold: *text*
    // Italic: _text_ (not widely supported)
    return text;
  }

  /**
   * Format a structured message for WeChat
   */
  formatStructuredMessage(data: {
    title?: string;
    items?: Array<{ label: string; value: string }>;
    footer?: string;
  }): string {
    const lines: string[] = [];
    
    if (data.title) {
      lines.push(`🔵 ${data.title}`);
      lines.push('');
    }
    
    if (data.items) {
      for (const item of data.items) {
        lines.push(`• ${item.label}: ${item.value}`);
      }
    }
    
    if (data.footer) {
      lines.push('');
      lines.push(data.footer);
    }
    
    return lines.join('\n');
  }

  /**
   * Format a bounty notification for WeChat
   */
  formatBountyAlert(bounty: {
    owner: string;
    repo: string;
    number: number;
    title: string;
    estimatedValue: number;
    difficulty: string;
    url: string;
  }): string {
    return [
      `💰 **New Bounty Found!**`,
      ``,
      `📦 ${bounty.owner}/${bounty.repo}#${bounty.number}`,
      `${bounty.title}`,
      ``,
      `💵 Value: $${bounty.estimatedValue}`,
      `📊 Difficulty: ${bounty.difficulty}`,
      ``,
      `🔗 ${bounty.url}`,
    ].join('\n');
  }

  /**
   * Format earnings notification
   */
  formatEarningsNotification(earnings: {
    source: string;
    amount: string;
    currency: string;
    status: string;
  }): string {
    return [
      `✅ **Payment Received!**`,
      ``,
      `💰 ${earnings.amount} ${earnings.currency}`,
      `📍 Source: ${earnings.source}`,
      `Status: ${earnings.status}`,
    ].join('\n');
  }

  /**
   * Format agent status update
   */
  formatStatusUpdate(status: {
    activePRs: number;
    pendingEarnings: string;
    activeTasks: number;
    nextAction?: string;
  }): string {
    const lines = [
      `🦀 **Lobster Status**`,
      ``,
      `📋 Active PRs: ${status.activePRs}`,
      `💵 Pending: ${status.pendingEarnings}`,
      `🔧 Active Tasks: ${status.activeTasks}`,
    ];
    
    if (status.nextAction) {
      lines.push(``, `➡️  Next: ${status.nextAction}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Parse incoming WeChat message
   * (In OpenClaw context, this is handled by the message handler)
   */
  parseMessage(raw: unknown): WeChatMessage | null {
    try {
      const msg = raw as Record<string, unknown>;
      
      if (!msg.content && !msg.text) return null;
      
      return {
        id: String(msg.id || msg.messageId || Date.now()),
        fromUserId: String(msg.fromUserId || msg.fromUser || msg.user_id || 'unknown'),
        fromUserName: String(msg.fromUserName || msg.fromUser || ''),
        content: String(msg.content || msg.text || ''),
        timestamp: Number(msg.timestamp || Date.now()),
        type: (msg.type as 'text' | 'image' | 'voice' | 'file') || 'text',
      };
    } catch {
      return null;
    }
  }

  /**
   * Handle a WeChat command
   */
  async handleCommand(message: WeChatMessage): Promise<string> {
    const content = message.content.trim().toLowerCase();
    
    if (content.startsWith('/status')) {
      return this.getStatusCommand();
    }
    
    if (content.startsWith('/bounties')) {
      return this.getBountiesCommand();
    }
    
    if (content.startsWith('/help')) {
      return this.getHelpText();
    }
    
    // Default: pass to agent for processing
    return ''; // Empty = agent processes it
  }

  private getStatusCommand(): string {
    return this.formatStructuredMessage({
      title: 'Lobster Core Status',
      items: [
        { label: 'Mode', value: 'Active' },
        { label: 'Hunting', value: 'Enabled' },
        { label: 'Memory', value: 'Hot + Warm + Cold' },
      ],
      footer: 'Type /bounties to see available bounties',
    });
  }

  private getBountiesCommand(): string {
    return this.formatStructuredMessage({
      title: 'Bounty Hunting',
      items: [
        { label: 'Targets', value: 'labmain, mautic, Stellar-Uzima' },
        { label: 'Strategy', value: 'High ROI first' },
        { label: 'Min bounty', value: '$50' },
      ],
      footer: 'Use /claim <bounty_id> to start working',
    });
  }

  private getHelpText(): string {
    return [
      `🦀 **Lobster Core Commands**`,
      ``,
      `/status — View agent status`,
      `/bounties — View bounty hunting targets`,
      `/help — Show this help`,
      ``,
      `Just chat normally and I'll help you!`,
    ].join('\n');
  }
}
