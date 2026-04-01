import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { Tool, ToolContext, ToolOutput } from './tool.js';

export class FileReadTool implements Tool {
  name = 'file_read';
  description = 'Read the contents of a file from the filesystem.';

  get inputSchema() {
    return {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path to the file' },
        offset: { type: 'number', description: 'Byte offset to start reading from' },
        limit: { type: 'number', description: 'Maximum number of bytes to read' },
      },
      required: ['path'],
    };
  }

  isReadOnly(): boolean {
    return true;
  }

  async execute(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutput> {
    const filePath = input.path as string;
    const offset = input.offset as number | undefined;
    const limit = input.limit as number | undefined;

    try {
      const absolutePath = join(ctx.cwd, filePath);
      const stats = await stat(absolutePath);

      if (stats.isDirectory()) {
        return ToolOutput.error(`Path is a directory: ${filePath}`);
      }

      const content = await readFile(absolutePath, 'utf-8');
      let result = content;

      if (offset !== undefined) {
        result = content.slice(offset);
      }
      if (limit !== undefined) {
        result = result.slice(0, limit);
      }

      return ToolOutput.success(result);
    } catch (e: any) {
      return ToolOutput.error(`Failed to read ${filePath}: ${e.message}`);
    }
  }
}
