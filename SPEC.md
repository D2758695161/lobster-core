# Lobster Core — Agent Runtime Specification

## 起源

claw-code-rust (claw-cli/claw-code-rust) 是目前最好的开源 Agent Runtime 参考实现。
本项目不是简单的复制，而是基于其架构思想，用 Node.js/TypeScript 做一次进化。

claw-code-rust 的核心贡献：
- 模块化架构（Provider/Tools/Permissions/Tasks/Compact）
- 递归 Agent Loop（query.ts）
- 流式 Event 系统
- Token Budget 管理
- 权限策略分层

## 进化方向

### 与 claw-code-rust 的核心差异

| 维度 | claw-code-rust | lobster-core |
|------|----------------|--------------|
| 目标用户 | 开发者 CLI | 商业/运营团队 |
| 通信层 | 终端 REPL | **微信 + Web + API** |
| 任务来源 | 手动输入 | **自动发现 bounty** |
| 变现 | 无 | **内置钱包/支付** |
| 记忆 | 无 | **多级记忆系统** |
| 多Agent | 基本 | **完全支持** |

## 目标架构

```
lobster-core/
├── src/
│   ├── cli/                 # CLI 入口
│   │   ├── index.ts         # 主入口
│   │   └── repl.ts          # REPL 实现
│   ├── bootstrap/           # 初始化 & 配置
│   │   ├── config.ts        # 配置加载
│   │   └── env.ts          # 环境变量
│   ├── runtime/             # 核心运行时 ⭐
│   │   ├── query-engine.ts  # 递归 Agent Loop
│   │   ├── session.ts       # 会话状态
│   │   ├── event.ts         # Event 类型定义
│   │   └── token-budget.ts  # Token 预算管理
│   ├── provider/            # LLM Provider
│   │   ├── interface.ts     # Provider 接口
│   │   ├── anthropic.ts     # Anthropic 实现
│   │   ├── openai.ts        # OpenAI 兼容实现
│   │   └── mock.ts          # 测试用 Mock
│   ├── tools/               # 工具系统
│   │   ├── registry.ts       # 工具注册表
│   │   ├── orchestrator.ts  # 工具编排器
│   │   ├── tool.ts          # 工具接口
│   │   ├── bash.ts          # Bash 工具
│   │   ├── file-read.ts     # 文件读
│   │   ├── file-write.ts    # 文件写
│   │   ├── file-edit.ts     # 文件编辑（patch）
│   │   ├── web-fetch.ts     # 网页抓取
│   │   ├── web-search.ts    # 搜索
│   │   └── github.ts        # GitHub API 工具
│   ├── permissions/         # 权限系统
│   │   ├── policy.ts        # 策略接口
│   │   ├── deny.ts          # 全部拒绝
│   │   ├── auto-approve.ts  # 自动批准
│   │   └── interactive.ts   # 交互式审批
│   ├── tasks/              # 任务管理
│   │   ├── manager.ts       # 任务管理器
│   │   └── task.ts          # 任务定义
│   ├── compact/            # 上下文压缩
│   │   ├── budget.ts        # Token 预算
│   │   └── strategy.ts      # 压缩策略
│   ├── memory/            # 记忆系统 ⭐ 进化
│   │   ├── hot.ts          # 当前会话记忆
│   │   ├── warm.ts         # 近期重要记忆
│   │   └── cold.ts         # 归档记忆
│   ├── bounty/             # Bounty 狩猎 ⭐ 进化
│   │   ├── hunter.ts        # Bounty 自动发现
│   │   ├── claimer.ts       # Bounty 认领
│   │   └── wallet.ts        # USDT 钱包接口
│   ├── channels/           # 通信渠道 ⭐ 进化
│   │   ├── wechat.ts        # 微信接入
│   │   ├── telegram.ts       # Telegram 接入
│   │   ├── webhook.ts       # Webhook
│   │   └── api.ts           # REST API
│   └── index.ts
├── test/
│   ├── query-engine.test.ts
│   ├── orchestrator.test.ts
│   └── token-budget.test.ts
└── package.json
```

## 核心模块详解

### 1. Query Engine（query-engine.ts）

这是核心递归循环，相当于 claw-code-rust 的 query.rs：

```typescript
class QueryEngine {
  async *query(
    session: SessionState,
    provider: ModelProvider,
    tools: ToolRegistry,
    events: EventEmitter
  ): AsyncGenerator<QueryEvent> {
    // 1. 构建 ModelRequest
    // 2. 流式调用 provider
    // 3. 收集 text 和 tool_use 块
    // 4. 通过 orchestrator 执行工具
    // 5. 追加 tool_result
    // 6. 循环回到步骤1
  }
}
```

Event 类型（对应 claw-code-rust 的 QueryEvent）：
- `TextDelta` - 流式文本
- `ToolUseStart` - 工具调用开始
- `ToolResult` - 工具执行结果
- `TurnComplete` - 一轮结束
- `Usage` - Token 使用量
- `Thinking` - 思考过程

### 2. Token Budget（token-budget.ts）

对应 claw-code-rust 的 compact/budget.rs：

```typescript
interface TokenBudget {
  contextWindow: number;      // 模型上下文上限，如 200000
  maxOutputTokens: number;    // 留给输出的，如 16000
  compactThreshold: number;    // 触发压缩的阈值，如 0.8
  
  inputBudget(): number;       // 可用于输入的 token
  shouldCompact(currentTokens: number): boolean;
}
```

### 3. Tool Orchestrator（orchestrator.ts）

对应 claw-code-rust 的 orchestrator.rs：

关键创新：
- **并发/顺序分离**：只读工具并行执行，突变工具顺序执行
- **权限预检**：执行前检查权限策略
- **批量编排**：支持一次调用多个工具

### 4. Memory Tiering（memory/）

claw-code-rust 没有记忆系统，这是我们的核心差异化：

```typescript
// 三级记忆架构
interface MemoryStore {
  // 热存储：当前会话 + 最近 1 小时
  hot: Map<string, MemoryItem>;
  
  // 温存储：最近 7 天的重要记忆
  warm: Map<string, MemoryItem>;
  
  // 冷存储：归档的历史
  cold: Map<string, MemoryItem>;
}
```

### 5. Bounty Hunter（bounty/）

集成自动 bounty 发现和认领系统：

```typescript
interface BountyHunter {
  // 自动扫描 GitHub bounty
  scanTargets(): Promise<Bounty[]>;
  
  // 评估 bounty 价值
  evaluate(bounty: Bounty): number; // ROI 评分
  
  // 自动认领（无竞争的）
  claim(bounty: Bounty): Promise<ClaimResult>;
  
  // 自动实现并提交 PR
  implement(bounty: Bounty): Promise<PRResult>;
}
```

### 6. Channels（channels/）

多渠道接入：

```typescript
interface Channel {
  send(message: Message): Promise<void>;
  receive(handler: (msg: Message) => Promise<void>): void;
}

// 微信：对接 OpenClaw 的 weixin channel
// Telegram：Bot API
// Webhook：外部系统集成
// API：给其他服务调用
```

## 实现优先级

### P0（最优先，实现核心）
1. `provider/interface.ts` + `anthropic.ts` - LLM 调用
2. `runtime/query-engine.ts` - 核心循环
3. `runtime/session.ts` - 会话状态
4. `runtime/event.ts` - Event 类型
5. `runtime/token-budget.ts` - Token 管理

### P1（工具系统）
6. `tools/tool.ts` + `registry.ts` - 工具基础
7. `tools/orchestrator.ts` - 编排器
8. `tools/bash.ts` - Bash 执行
9. `tools/file-read.ts` + `file-write.ts` - 文件操作
10. `tools/web-fetch.ts` - 网页抓取

### P2（权限 + 任务）
11. `permissions/policy.ts` - 策略接口
12. `permissions/auto-approve.ts` - 自动批准
13. `permissions/deny.ts` - 拒绝策略
14. `tasks/manager.ts` - 任务管理

### P3（进化功能）
15. `memory/` - 多级记忆
16. `bounty/hunter.ts` - Bounty 自动狩猎
17. `channels/wechat.ts` - 微信接入
18. `compact/strategy.ts` - 上下文压缩

## 与 OpenClaw 的关系

**lobster-core 不是要替代 OpenClaw，而是:**

- OpenClaw = Agent 基础设施（CLI、Channel、Memory、Cron）
- lobster-core = Agent Runtime（Query Loop、Tools、Provider）
- 两者可以叠加使用：OpenClaw 管理生命周期，lobster-core 处理具体任务执行

**演进策略：**
- 先作为独立 Node.js 包开发
- 成熟后可以植入 OpenClaw 作为技能
- 最终目标：完整的"商业化 Agent OS"

## 技术栈

- **语言**: TypeScript（严格模式）
- **运行时**: Node.js 20+
- **AI SDK**: @anthropic-ai/sdk 或自定义
- **测试**: Vitest
- **构建**: tsup（打包成 ESM + CJS）
