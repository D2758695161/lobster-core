export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;

  /** 是否只读（可并发执行） */
  isReadOnly(): boolean;

  /** 执行工具 */
  execute(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutput>;
}

export interface ToolContext {
  cwd: string;
  sessionId: string;
}

export interface ToolOutput {
  content: string;
  isError: boolean;
}

export namespace ToolOutput {
  export function success(content: string): ToolOutput {
    return { content, isError: false };
  }

  export function error(content: string): ToolOutput {
    return { content, isError: true };
  }
}
