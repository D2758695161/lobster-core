import { spawn } from 'child_process';
import { Tool, ToolContext, ToolOutput } from './tool.js';

export class BashTool implements Tool {
  name = 'bash';
  description = 'Execute a bash command. Use for file operations, git, npm, etc.';

  get inputSchema() {
    return {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 60000)' },
      },
      required: ['command'],
    };
  }

  isReadOnly(): boolean {
    // Bash commands can be anything - default to sequential (mutating)
    return false;
  }

  async execute(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutput> {
    const command = input.command as string;
    const timeout = (input.timeout as number) || 60000;

    return new Promise((resolve) => {
      const proc = spawn(command, [], {
        shell: true,
        cwd: ctx.cwd,
        timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(ToolOutput.success(stdout || '(no output)'));
        } else {
          resolve(ToolOutput.error(`Exit code ${code}: ${stderr || stdout}`));
        }
      });

      proc.on('error', (err) => {
        resolve(ToolOutput.error(`Execution error: ${err.message}`));
      });
    });
  }
}
