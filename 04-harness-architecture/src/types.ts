/**
 * Harness 架构的核心类型定义
 *
 * Harness 架构的核心思想：把 LLM 从"问答机"变成"智能体"
 * 关键在于增加一个编排层（Harness），让 LLM 能够：
 *   1. 感知环境（Observe）
 *   2. 推理决策（Reason）
 *   3. 执行行动（Act）
 *   4. 循环往复，直到任务完成
 *
 * 这个 ReAct 循环就是 Harness 的核心运行机制
 */

// ============================================================
// 工具系统（Tools）— 智能体与环境交互的"手脚"
// ============================================================

/** 工具的描述信息 — LLM 需要这些信息来决定何时使用哪个工具 */
export interface ToolDefinition {
  name: string;        // 工具名称，如 "calculator"
  description: string; // 工具描述，帮助 LLM 理解何时该用这个工具
  parameters: Record<string, {
    type: "string" | "number" | "boolean";
    description: string;
    required?: boolean;
  }>;
}

/** 工具执行的结果 */
export interface ToolResult {
  success: boolean;
  output: string;      // 工具返回的文本结果
  error?: string;      // 如果失败，错误信息
}

/** 工具的实现 — 一个函数，接收参数，返回结果 */
export type ToolExecutor = (params: Record<string, unknown>) => Promise<ToolResult>;

/** 完整的工具 = 定义 + 实现 */
export interface Tool extends ToolDefinition {
  execute: ToolExecutor;
}

// ============================================================
// 记忆系统（Memory）— 智能体的"短期记忆"
// ============================================================

/** 单条记忆记录 */
export interface MemoryEntry {
  role: "observation" | "reasoning" | "action" | "result";
  content: string;
  timestamp: number;
}

/** 记忆系统 — 存储智能体的思考过程和观察结果 */
export interface Memory {
  entries: MemoryEntry[];
  /** 添加一条记忆 */
  add(role: MemoryEntry["role"], content: string): void;
  /** 获取格式化的记忆摘要（用于构建 LLM 的上下文） */
  getSummary(): string;
  /** 清空记忆 */
  clear(): void;
}

// ============================================================
// ReAct 循环的步骤 — Harness 的核心流程
// ============================================================

/** LLM 的输出可能包含推理和行动 */
export interface LLMResponse {
  /** LLM 的推理过程（Thought） */
  reasoning: string;
  /** LLM 决定要执行的行动（Action） */
  action?: {
    tool: string;                        // 使用哪个工具
    parameters: Record<string, unknown>; // 工具参数
  };
  /** LLM 认为任务已完成，直接给出最终答案 */
  finalAnswer?: string;
}

/** Harness 循环中的单步执行结果 */
export interface StepResult {
  stepNumber: number;
  reasoning: string;     // 本步的推理
  action?: string;       // 本步的行动描述
  observation?: string;  // 行动后的观察结果
  finalAnswer?: string;  // 如果任务完成，最终答案
}

/** Harness 的完整运行结果 */
export interface HarnessResult {
  task: string;           // 原始任务
  steps: StepResult[];    // 所有步骤
  finalAnswer: string;    // 最终答案
  totalSteps: number;     // 总步数
  success: boolean;       // 是否成功完成
}

// ============================================================
// Harness 配置
// ============================================================

export interface HarnessConfig {
  /** 最大循环步数，防止无限循环 */
  maxSteps: number;
  /** LLM 温度参数 */
  temperature?: number;
  /** 任务完成时的提示词标记 */
  finishMarker?: string;
}
