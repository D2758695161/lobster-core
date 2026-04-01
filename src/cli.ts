/**
 * lobster-core CLI
 * 
 * Usage:
 *   npx lobster-core --task "Find and fix a bug"
 *   npx lobster-core --chat "Hello"
 *   npx lobster-core --hunt
 */

import { parseArgs } from 'util';
import { createAgent } from './index.js';
import { BountyHunter } from './bounty/hunter.js';
import { LobsterWallet, getTrc20Balance } from './wallet/index.js';

async function main() {
  const { values } = parseArgs({
    options: {
      task: { type: 'string', short: 't' },
      chat: { type: 'string', short: 'c' },
      hunt: { type: 'boolean', short: 'H' },
      wallet: { type: 'string', short: 'w' },
      balance: { type: 'string', short: 'b' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(`
lobster-core CLI

Options:
  -t, --task <prompt>    Run a task with the agent
  -c, --chat <message>   Chat with the agent
  -H, --hunt             Hunt for bounties
  -w, --wallet <addr>   Set wallet address
  -b, --balance <addr>  Check wallet balance

Examples:
  npx lobster-core --task "Fix the null pointer bug in auth.ts"
  npx lobster-core --hunt
  npx lobster-core --balance TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9
`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!apiKey || !githubToken) {
    console.error('Error: Set ANTHROPIC_API_KEY and GITHUB_TOKEN env vars');
    process.exit(1);
  }

  // Check balance
  if (values.balance) {
    console.log(`Checking balance for ${values.balance}...`);
    const balance = await getTrc20Balance(values.balance);
    console.log(`${balance.balance} ${balance.symbol} (${balance.chain})`);
    console.log(`Explorer: ${balance.explorerUrl}`);
    return;
  }

  // Hunt for bounties
  if (values.hunt) {
    console.log('Starting bounty hunt...');
    const hunter = new BountyHunter({
      targets: [
        {
          name: 'high-value',
          type: 'org',
          patterns: [
            'label:bug is:issue is:open created:>2026-03-20',
            'bounty is:issue is:open created:>2026-03-15',
          ],
        },
      ],
      githubToken,
      walletAddress: values.wallet || process.env.WALLET_ADDRESS || '',
      maxAgeDays: 30,
      minBounty: 50,
    });

    const bounties = await hunter.hunt();
    console.log(`\nFound ${bounties.length} bounties:\n`);

    for (const b of bounties.slice(0, 10)) {
      console.log(`$${b.estimatedValue} | ${b.difficulty} | ${b.owner}/${b.repo}#${b.number}`);
      console.log(`  ${b.title}`);
      console.log(`  ${b.url}`);
      console.log();
    }
    return;
  }

  // Default: run a task
  const task = values.task || values.chat;
  if (!task) {
    console.log('Usage: lobster-core --task "your task here"');
    console.log('Or: lobster-core --help');
    return;
  }

  console.log(`Running: ${task}\n`);

  const agent = await createAgent(apiKey, githubToken, values.wallet || '');

  const response = await agent.run(task);
  console.log(response);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
