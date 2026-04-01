/**
 * lobster-core Examples
 */

import { createAgent } from '../src/index.js';
import { BountyHunter } from '../src/bounty/hunter.js';
import { LobsterWallet } from '../src/wallet/index.js';

async function exampleChat() {
  console.log('=== Example: Chat ===\n');

  const agent = await createAgent(
    process.env.ANTHROPIC_API_KEY!,
    process.env.GITHUB_TOKEN!,
    '0xaae0101ac77a2e4e0ea826eb4d309374f029b0a6'
  );

  const response = await agent.run(
    'Introduce yourself briefly. What can you do?'
  );

  console.log(response);
}

async function exampleBountyHunt() {
  console.log('=== Example: Bounty Hunt ===\n');

  const hunter = new BountyHunter({
    targets: [
      {
        name: 'labmain',
        type: 'repo',
        patterns: ['bounty is:issue is:open created:>2026-03-20'],
      },
    ],
    githubToken: process.env.GITHUB_TOKEN!,
    walletAddress: '0xaae0101ac77a2e4e0ea826eb4d309374f029b0a6',
    maxAgeDays: 30,
    minBounty: 50,
  });

  const bounties = await hunter.hunt();

  console.log(`Found ${bounties.length} bounties:\n`);

  for (const b of bounties.slice(0, 5)) {
    console.log(`$${b.estimatedValue} ${b.difficulty} ${b.owner}/${b.repo}#${b.number}`);
    console.log(`  ${b.title}`);
    console.log(`  ${b.url}`);
    console.log();
  }
}

async function exampleWallet() {
  console.log('=== Example: Wallet ===\n');

  const wallet = new LobsterWallet('TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9');
  const balance = await wallet.getBalance();

  console.log(`Address: ${balance.address}`);
  console.log(`Chain: ${balance.chain}`);
  console.log(`Balance: ${balance.balance} ${balance.symbol}`);
  console.log(`Explorer: ${balance.explorerUrl}`);
}

async function main() {
  try {
    // Check env vars
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('Skipping chat example (no ANTHROPIC_API_KEY)');
    } else {
      await exampleChat();
    }

    if (process.env.GITHUB_TOKEN) {
      await exampleBountyHunt();
    }

    await exampleWallet();
  } catch (e) {
    console.error('Error:', e);
  }
}

main();
