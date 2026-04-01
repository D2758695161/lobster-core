/**
 * GitHub Tool — for bounty hunting and repo management
 * 
 * This is a critical tool for lobster-core's auto-bounty feature.
 */

import { Tool, ToolContext, ToolOutput } from './tool.js';

export interface GitHubConfig {
  token: string;
}

export class GitHubTool implements Tool {
  name = 'github';
  description = 'Interact with GitHub API. Search issues, create PRs, post comments, fork repos.';

  private token: string;

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN || '';
  }

  get inputSchema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search_issues', 'get_issue', 'create_pr', 'post_comment', 'fork_repo', 'get_file', 'list_prs'],
          description: 'The GitHub action to perform'
        },
        // Search
        query: { type: 'string', description: 'Search query (for search_issues)' },
        sort: { type: 'string', description: 'Sort field: stars, updated, created' },
        order: { type: 'string', description: 'Sort order: desc, asc' },
        per_page: { type: 'number', description: 'Results per page (max 100)' },
        // Issue/PR
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        number: { type: 'number', description: 'Issue or PR number' },
        // Create PR
        title: { type: 'string', description: 'PR title' },
        head: { type: 'string', description: 'Head branch (your fork)' },
        base: { type: 'string', description: 'Base branch (target repo)' },
        body: { type: 'string', description: 'PR body' },
        // Post comment
        comment_body: { type: 'string', description: 'Comment content' },
        // File
        path: { type: 'string', description: 'File path in repo' },
        content: { type: 'string', description: 'File content' },
        message: { type: 'string', description: 'Commit message' },
        // Fork
        target_owner: { type: 'string', description: 'Owner of repo to fork' },
        target_repo: { type: 'string', description: 'Repo to fork' },
      },
      required: ['action']
    };
  }

  isReadOnly(): boolean {
    // Most actions are read operations
    return false; // Actually could be read-only for some actions
  }

  async execute(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutput> {
    if (!this.token) {
      return ToolOutput.error('GitHub token not set. Set GITHUB_TOKEN env var.');
    }

    const action = input.action as string;

    try {
      switch (action) {
        case 'search_issues':
          return await this.searchIssues(input);
        case 'get_issue':
          return await this.getIssue(input);
        case 'create_pr':
          return await this.createPr(input);
        case 'post_comment':
          return await this.postComment(input);
        case 'fork_repo':
          return await this.forkRepo(input);
        case 'get_file':
          return await this.getFile(input);
        case 'list_prs':
          return await this.listPrs(input);
        default:
          return ToolOutput.error(`Unknown action: ${action}`);
      }
    } catch (e: any) {
      return ToolOutput.error(`GitHub API error: ${e.message}`);
    }
  }

  private async githubFetch(path: string, options: RequestInit = {}): Promise<any> {
    const url = `https://api.github.com${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'lobster-core',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${response.status}: ${body}`);
    }

    return response.json();
  }

  private async searchIssues(input: Record<string, unknown>): Promise<ToolOutput> {
    const query = encodeURIComponent(input.query as string || '');
    const sort = (input.sort as string) || 'created';
    const order = (input.order as string) || 'desc';
    const perPage = Math.min((input.per_page as number) || 10, 100);

    const data = await this.githubFetch(
      `/search/issues?q=${query}&sort=${sort}&order=${order}&per_page=${perPage}`
    );

    const results = (data.items || []).map((item: any) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      repo: item.repository_url?.replace('https://api.github.com/repos/', ''),
      labels: item.labels?.map((l: any) => l.name) || [],
      comments: item.comments,
      url: item.html_url,
      bounty: item.labels?.some((l: any) => l.name.toLowerCase().includes('bounty')),
    }));

    return ToolOutput.success(JSON.stringify(results, null, 2));
  }

  private async getIssue(input: Record<string, unknown>): Promise<ToolOutput> {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const number = input.number as number;

    const data = await this.githubFetch(`/repos/${owner}/${repo}/issues/${number}`);

    return ToolOutput.success(JSON.stringify({
      number: data.number,
      title: data.title,
      body: data.body,
      state: data.state,
      labels: data.labels?.map((l: any) => l.name) || [],
      assignees: data.assignees?.map((u: any) => u.login) || [],
      comments: data.comments,
      created_at: data.created_at,
      url: data.html_url,
    }, null, 2));
  }

  private async createPr(input: Record<string, unknown>): Promise<ToolOutput> {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const title = input.title as string;
    const head = input.head as string;
    const base = (input.base as string) || 'main';
    const body = (input.body as string) || '';

    const data = await this.githubFetch(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title, head, base, body }),
    });

    return ToolOutput.success(JSON.stringify({
      number: data.number,
      url: data.html_url,
      state: data.state,
      merged: data.merged,
    }, null, 2));
  }

  private async postComment(input: Record<string, unknown>): Promise<ToolOutput> {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const number = input.number as number;
    const body = input.comment_body as string;

    await this.githubFetch(`/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });

    return ToolOutput.success(`Comment posted to ${owner}/${repo}#${number}`);
  }

  private async forkRepo(input: Record<string, unknown>): Promise<ToolOutput> {
    const owner = input.owner as string;
    const repo = input.repo as string;

    const data = await this.githubFetch(`/repos/${owner}/${repo}/forks`, {
      method: 'POST',
    });

    return ToolOutput.success(JSON.stringify({
      full_name: data.full_name,
      clone_url: data.clone_url,
      html_url: data.html_url,
    }, null, 2));
  }

  private async getFile(input: Record<string, unknown>): Promise<ToolOutput> {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const path = input.path as string;
    const ref = (input.ref as string) || undefined;

    try {
      const data = await this.githubFetch(
        `/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ''}`
      );

      if (data.encoding === 'base64') {
        const content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
        return ToolOutput.success(content);
      }

      return ToolOutput.success(data.content);
    } catch (e: any) {
      return ToolOutput.error(`File not found: ${path} — ${e.message}`);
    }
  }

  private async listPrs(input: Record<string, unknown>): Promise<ToolOutput> {
    const owner = input.owner as string;
    const repo = input.repo as string;
    const state = (input.state as string) || 'open';

    const data = await this.githubFetch(
      `/repos/${owner}/${repo}/pulls?state=${state}&per_page=20`
    );

    const prs = (Array.isArray(data) ? data : []).map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      merged: pr.merged,
      user: pr.user?.login,
      url: pr.html_url,
    }));

    return ToolOutput.success(JSON.stringify(prs, null, 2));
  }
}
