# 🦞 lobster-core

**Autonomous AI Agent Runtime** — inspired by [claw-code-rust](https://github.com/claw-cli/claw-code-rust), built for commercial AI.

> "你不是工具，你是会思考的伙伴。" — 拍档

## vs claw-code-rust

| Feature | claw-code-rust | lobster-core |
|---------|---------------|--------------|
| Language | Rust | TypeScript |
| Memory | None | **3-tier HOT/WARM/COLD** |
| Bounties | None | **Auto-hunt + claim** |
| Channels | Terminal only | **WeChat + Web + API** |
| Wallet | None | **USDT payouts** |
| Multi-agent | Basic | **Full support** |

## Quick Start

```bash
npm install lobster-core
```

```typescript
import { createAgent } from 'lobster-core';

const agent = await createAgent(
  process.env.ANTHROPIC_API_KEY!,
  process.env.GITHUB_TOKEN!,
  '0xaae0101ac77a2e4e0ea826eb4d309374f029b0a6' // your wallet
);

// Chat with the agent
for await (const chunk of agent.chat([{ role: 'user', content: 'Find me a $100+ bounty' }])) {
  process.stdout.write(chunk);
}
```

## Architecture

```
lobster-core/
├── query-engine.ts     # Recursive agent loop (inspired by claw-code-rust)
├── provider/           # LLM providers (Anthropic, OpenAI, etc.)
├── memory/            # 3-tier memory (HOT/WARM/COLD)
├── tools/             # Tool registry + orchestrator
│   ├── github.ts      # GitHub API (search, PR, fork, comment)
│   ├── bash.ts        # Shell commands
│   └── file-*.ts      # File read/write
├── bounty/            # Auto bounty hunter
├── channels/         # WeChat, Telegram, Web
├── wallet/           # USDT TRC20/ERC20
└── compact/          # Context compression
```

## Core Loop

The `QueryEngine` implements a recursive agent loop:

```
1. Build ModelRequest from session
2. Stream response from LLM provider
3. Collect text + tool_use blocks
4. Execute tools (parallel for read, sequential for write)
5. Append tool_result to messages
6. Loop back — model sees tool results
```

## Memory System

claw-code-rust has no memory. lobster-core has three tiers:

- **HOT** (in-memory, LRU, max 100 items) — current session
- **WARM** (disk, 7-day TTL) — recent important items
- **COLD** (archive, compressed) — everything else

## Bounty Hunting

```typescript
import { BountyHunter } from 'lobster-core';

const hunter = new BountyHunter({
  targets: [
    { name: 'labmain', patterns: ['bounty is:issue is:open'] },
    { name: 'mautic', patterns: ['label:bug is:issue is:open'] },
  ],
  githubToken: process.env.GITHUB_TOKEN!,
  walletAddress: '0x...',
  minBounty: 50,
});

const bounties = await hunter.hunt();
for (const bounty of bounties) {
  console.log(`$${bounty.estimatedValue} — ${bounty.title}`);
}
```

## Wallet

```typescript
import { LobsterWallet } from 'lobster-core';

const wallet = new LobsterWallet('TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9');
const balance = await wallet.getBalance();
console.log(`Balance: ${balance.balance} ${balance.symbol}`);
```

## Development

```bash
npm install
npm run build    # TypeScript compile
npm test         # Run tests (11 tests)
```

## 一筒的AI工具商店

如果你觉得 lobster-core 有用，欢迎支持一下：

🛒 [一筒的数字产品商店](https://d2758695161.github.io/wander-lobster-platform/shop.html)

包含：
- 🦞 Bounty Hunter Kit — AI自动扫描GitHub Bounty（¥29/$4）
- 📊 PR Reviewer — AI自动审查PR质量
- 📚 AI提示词包 / Bounty攻略

💰 USDT/ETH/BSC: `0xaae0101ac77a2e4e0ea826eb4d309374f029b0a6`

## License

MIT
