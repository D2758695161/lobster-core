import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { Tool, ToolContext, ToolOutput } from './tool.js';

export class FileWriteTool implements Tool {
  name = 'file_write';
  description = 'Write content to a file. Creates parent directories if needed.';

  get inputSchema() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute file path' },
        content: { type: 'string', description: 'Content to write to the file' },
        append: { type: 'boolean', description: 'Append to existing file instead of overwriting' },
      },
      required: ['path', 'content'],
    };
  }

  isReadOnly(): boolean {
    return false;
  }

  async execute(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutput> {
    const filePath = input.path as string;
    const content = input.content as string;
    const append = input.append as boolean | undefined;

    try {
      // Ensure parent directory exists
      await mkdir(dirname(filePath), { recursive: true });

      const flag = append ? 'a' : 'w';
      await writeFile(filePath, content, { flag, encoding: 'utf-8' });

      return ToolOutput.success(`Written ${content.length} bytes to ${filePath}`);
    } catch (e: any) {
      return ToolOutput.error(`Failed to write ${filePath}: ${e.message}`);
    }
  }
}
