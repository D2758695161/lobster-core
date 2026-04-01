import { execSync } from 'child_process';
import { Tool, ToolContext, ToolOutput } from './tool.js';

export class GrepTool implements Tool {
  name = 'grep';
  description = 'Search for patterns in files using regex. Returns matching lines with context.';

  get inputSchema() {
    return {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory path to search in' },
        recursive: { type: 'boolean', description: 'Search recursively in subdirectories' },
        case_sensitive: { type: 'boolean', description: 'Case sensitive matching' },
      },
      required: ['pattern', 'path'],
    };
  }

  isReadOnly(): boolean {
    return true;
  }

  async execute(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutput> {
    const { pattern, path, recursive = false, case_sensitive = true } = input;

    try {
      // Simple grep implementation using Node.js
      // In production, use ripgrep (rg) for performance
      const flags = `${recursive ? '-r' : ''} ${case_sensitive ? '' : '-i'}`;
      const cmd = `grep -n ${flags} "${pattern}" "${path}" 2>/dev/null || true`;
      const result = execSync(cmd, { encoding: 'utf-8', timeout: 10000, cwd: ctx.cwd });

      if (!result.trim()) {
        return ToolOutput.success('No matches found');
      }

      return ToolOutput.success(result);
    } catch (e: any) {
      return ToolOutput.error(`Grep failed: ${e.message}`);
    }
  }
}
