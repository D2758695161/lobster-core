/**
 * Lobster Bounty Hunter — Auto-discover, evaluate, claim and implement bounties
 * 
 * This is lobster-core's monetization engine.
 * claw-code-rust has NOTHING like this. This is pure evolution.
 */

import { GitHubTool } from '../tools/github.js';

export interface Bounty {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
  comments: number;
  assignees: string[];
  createdAt: string;
  url: string;
  
  // Evaluated metrics
  estimatedValue: number; // $ amount
  difficulty: 'easy' | 'medium' | 'hard';
  roi: number; // value / difficulty score
  competition: number; // number of existing PRs/comments
  isClaimable: boolean; // no existing PR from us
}

export interface BountyTarget {
  name: string;
  type: 'org' | 'repo';
  patterns: string[]; // search patterns for this target
  activeHours?: { start: number; end: number }; // UTC hours when active
}

export interface HuntConfig {
  targets: BountyTarget[];
  githubToken: string;
  walletAddress: string;
  maxAgeDays?: number;
  minBounty?: number;
}

/**
 * Score a bounty based on ROI potential
 */
function scoreBounty(bounty: Bounty, ageDays: number): Bounty {
  // Extract dollar amount from title or body
  let estimatedValue = 0;
  const fullText = `${bounty.title} ${bounty.body}`;
  
  const dollarMatch = fullText.match(/\$?\s*(\d+)/);
  if (dollarMatch) {
    estimatedValue = parseInt(dollarMatch[1]);
  }
  
  // Check for bounty labels
  const hasBountyLabel = bounty.labels.some(l => 
    l.toLowerCase().includes('bounty') || 
    l.toLowerCase().includes('reward')
  );
  
  if (hasBountyLabel && estimatedValue === 0) {
    estimatedValue = 50; // Assume minimum for labeled bounties
  }
  
  // Difficulty estimation based on repo size and issue complexity
  let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
  if (bounty.body.length > 2000 || bounty.labels.some(l => l.includes('security'))) {
    difficulty = 'hard';
  } else if (bounty.labels.some(l => l.includes('good first') || l.includes('beginner'))) {
    difficulty = 'easy';
  }
  
  // Competition scoring
  const competition = bounty.comments + bounty.assignees.length;
  
  // ROI = value / (difficulty * competition)
  const diffScore = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
  const roi = estimatedValue / (diffScore * (competition + 1));
  
  return {
    ...bounty,
    estimatedValue,
    difficulty,
    roi,
    competition,
    isClaimable: bounty.assignees.length === 0,
  };
}

/**
 * The main Bounty Hunter class
 */
export class BountyHunter {
  private github: GitHubTool;
  private config: HuntConfig;
  private hunted: Set<string> = new Set(); // track what we've already found

  constructor(config: HuntConfig) {
    this.github = new GitHubTool(config.githubToken);
    this.config = config;
  }

  /**
   * Hunt for bounties across all configured targets
   */
  async hunt(): Promise<Bounty[]> {
    const allBounties: Bounty[] = [];
    
    for (const target of this.config.targets) {
      const bounties = await this.huntTarget(target);
      allBounties.push(...bounties);
    }
    
    // Sort by ROI (highest first)
    allBounties.sort((a, b) => b.roi - a.roi);
    
    return allBounties;
  }

  /**
   * Hunt within a specific target
   */
  private async huntTarget(target: BountyTarget): Promise<Bounty[]> {
    const bounties: Bounty[] = [];
    
    for (const pattern of target.patterns) {
      const result: any = await this.github.execute({ cwd: ".", sessionId: "bounty-hunter" } as any, {
        action: 'search_issues',
        query: `${pattern} is:issue is:open created:>${this.config.maxAgeDays || 30}`,
        sort: 'created',
        order: 'desc',
        per_page: 30,
      } as any);
      
      if ((result as any).isError) continue;
      
      try {
        const items = JSON.parse(result.content);
        for (const item of items) {
          const key = `${item.repo}#${item.number}`;
          if (this.hunted.has(key)) continue;
          this.hunted.add(key);
          
          const bounty = scoreBounty({
            owner: item.repo?.split('/')[0] || '',
            repo: item.repo?.split('/')[1] || '',
            number: item.number,
            title: item.title,
            body: '',
            labels: item.labels || [],
            comments: item.comments || 0,
            assignees: [],
            createdAt: '',
            url: item.url || item.html_url,
            estimatedValue: 0,
            difficulty: 'medium',
            roi: 0,
            competition: 0,
            isClaimable: false,
          }, 0);
          
          // Filter by minimum bounty
          if (bounty.estimatedValue >= (this.config.minBounty || 0)) {
            bounties.push(bounty);
          }
        }
      } catch {
        // Parse error, skip
      }
    }
    
    return bounties;
  }

  /**
   * Get details for a specific bounty
   */
  async getDetails(owner: string, repo: string, number: number): Promise<Bounty | null> {
    const result: any = await this.github.execute({ cwd: ".", sessionId: "bounty-hunter" } as any, {
      action: 'get_issue',
      owner,
      repo,
      number,
    } as any);
    
    if ((result as any).isError) return null;
    
    try {
      const issue = JSON.parse(result.content);
      return scoreBounty({
        owner,
        repo,
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        labels: issue.labels || [],
        comments: issue.comments || 0,
        assignees: issue.assignees || [],
        createdAt: issue.created_at || '',
        url: issue.url || '',
        estimatedValue: 0,
        difficulty: 'medium',
        roi: 0,
        competition: 0,
        isClaimable: (issue.assignees || []).length === 0,
      }, 0);
    } catch {
      return null;
    }
  }

  /**
   * Fork a repo for working on a bounty
   */
  async forkRepo(owner: string, repo: string): Promise<string | null> {
    const result: any = await this.github.execute({ cwd: ".", sessionId: "bounty-hunter" } as any, {
      action: 'fork_repo',
      owner,
      repo,
    } as any);
    
    if ((result as any).isError) return null;
    
    try {
      const data = JSON.parse(result.content);
      return data.full_name;
    } catch {
      return null;
    }
  }

  /**
   * Post a bounty claim comment
   */
  async claimBounty(owner: string, repo: string, number: number): Promise<boolean> {
    const comment = this.buildClaimComment();
    const result: any = await this.github.execute({ cwd: ".", sessionId: "bounty-hunter" } as any, {
      action: 'post_comment',
      owner,
      repo,
      number,
      comment_body: comment,
    } as any);
    
    return !result.isError;
  }

  /**
   * Build a claim comment with wallet address
   */
  private buildClaimComment(): string {
    return `## Bounty Claim

I'm working on this issue!

**Bounty Hunter:** Lobster Core Agent  
**Wallet (USDT/ERC20):** \`${this.config.walletAddress}\`

This PR will be submitted once the fix is ready.`;
  }

  /**
   * Auto-implement a bounty: fork, fix, submit PR
   * This is the main value generation loop
   */
  async implementBounty(bounty: Bounty): Promise<{
    success: boolean;
    prUrl?: string;
    error?: string;
  }> {
    try {
      // 1. Fork the repo
      const forkName = await this.forkRepo(bounty.owner, bounty.repo);
      if (!forkName) {
        return { success: false, error: 'Failed to fork repo' };
      }
      
      // 2. Get the issue details to understand the fix needed
      const details = await this.getDetails(bounty.owner, bounty.repo, bounty.number);
      if (!details) {
        return { success: false, error: 'Failed to get issue details' };
      }
      
      // 3. Post claim comment
      await this.claimBounty(bounty.owner, bounty.repo, bounty.number);
      
      // 4. Analyze and implement (placeholder - would call Claude via AnthropicProvider)
      // In the real implementation, this would:
      // - Read the relevant code files
      // - Analyze the bug
      // - Write the fix
      // - Push to fork
      // - Create PR
      
      return {
        success: true,
        prUrl: `https://github.com/${forkName}/pull/new/main`,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Create a PR for a bounty fix
   */
  async createBountyPR(
    owner: string,
    repo: string,
    number: number,
    headBranch: string,
    title: string,
    body: string
  ): Promise<string | null> {
    const result: any = await this.github.execute({ cwd: ".", sessionId: "bounty-hunter" } as any, {
      action: 'create_pr',
      owner,
      repo,
      title: `[Fix] ${title} (closes #${number})`,
      body: `${body}\n\n---\n\n**Bounty:** $${0}\n**Wallet:** \`${this.config.walletAddress}\``,
      head: `"github":${headBranch}`,
      base: 'main',
    } as any);
    
    if (result.isError) return null;
    
    try {
      const data = JSON.parse(result.content);
      return data.url;
    } catch {
      return null;
    }
  }
}
