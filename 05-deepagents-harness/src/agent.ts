/**
 * DeepAgent 工厂 + 流式输出辅助
 *
 * 核心对比 04 项目：
 *   - 04: AgentHarness 类 (250+ 行) 手动实现 ReAct 循环
 *     → buildPrompt → invoke LLM → parseLLMOutput (regex) → execute tool → memory.add
 *   - 05: createDeepAgent() 一行创建，底层由 LangGraph 提供
 *     → 原生 function calling（无需 regex）
 *     → 内置状态管理（无需手动 memory）
 *     → 内置规划/文件系统/子代理（无需手动实现）
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent, StateBackend } from "deepagents";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { customTools } from "./tools.js";

// 加载根目录 .env（同 04 项目约定）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ============================================================
// 创建 LLM 模型 — DashScope qwen-plus via OpenAI 兼容接口
// 与 04 项目完全相同的配置
// ============================================================
export function createModel(): ChatOpenAI {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.error("缺少环境变量 DASHSCOPE_API_KEY，请在根目录 .env 中配置");
    process.exit(1);
  }
  return new ChatOpenAI({
    modelName: process.env.DASHSCOPE_MODEL,
    temperature: 0.3,
    apiKey,
    configuration: {
      baseURL: process.env.DASHSCOPE_BASE_URL,
    },
  });
}

// ============================================================
// 创建 DeepAgent — 核心工厂函数
//
// DeepAgents 提供了 04 项目手动实现的所有 Harness 功能：
//   - ReAct 循环 → LangGraph 内置工具调用循环
//   - Prompt 构建 → 内置 systemPrompt + 中间件自动组装
//   - 输出解析 → 原生 function calling（无需 regex）
//   - 记忆管理 → LangGraph state + StateBackend 虚拟文件系统
//   - 循环控制 → recursionLimit 参数
// ============================================================
export function createAgent(options?: {
  systemPrompt?: string;
  tools?: typeof customTools;
}) {
  const model = createModel();
  return createDeepAgent({
    model,
    tools: options?.tools ?? customTools,
    systemPrompt:
      options?.systemPrompt ?? "你是一个严谨的 AI 助手，请使用提供的工具完成任务。",
    // StateBackend = 内存中的虚拟文件系统
    // Agent 的 write_file/read_file 等操作在内存中完成
    backend: new StateBackend(),
  });
}

// ============================================================
// 运行 Agent 并展示逐步执行过程
//
// 使用 invoke() 完成执行后，遍历消息历史展示每一步：
//   - HumanMessage → 用户任务
//   - AIMessage (有 tool_calls) → Agent 决定调用工具
//   - ToolMessage → 工具执行结果
//   - AIMessage (无 tool_calls) → 最终回答
//
// 这比 streamEvents v3 更稳定，且能完整展示 Agent 的推理链路
// ============================================================
export async function runAgentWithStreaming(
  agent: ReturnType<typeof createDeepAgent>,
  task: string,
  options?: { recursionLimit?: number }
): Promise<{ finalAnswer: string }> {
  const result = await agent.invoke(
    {
      messages: [new HumanMessage(task)],
    },
    {
      recursionLimit: options?.recursionLimit ?? 80,
    }
  );

  const messages = result.messages;
  let finalAnswer = "";

  // 遍历消息历史，展示 Agent 的逐步执行过程
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg instanceof HumanMessage) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      console.log(`\n[用户] ${content}`);
    } else if (msg instanceof AIMessage) {
      // AI 消息可能包含文本和/或工具调用
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Agent 决定调用工具
        for (const tc of msg.tool_calls) {
          console.log(`\n[Agent → 工具] ${tc.name}`);
          console.log(`  参数: ${JSON.stringify(tc.args)}`);
        }
      } else if (content.trim()) {
        // 最终回答（无工具调用）
        console.log(`\n[Agent 最终回答] ${content}`);
        finalAnswer = content;
      }
    } else if (msg instanceof ToolMessage) {
      // 工具执行结果
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const truncated =
        content.length > 300 ? content.slice(0, 300) + "..." : content;
      console.log(`  结果: ${truncated}`);
    }
  }

  if (!finalAnswer) {
    const lastMsg = messages[messages.length - 1];
    finalAnswer =
      typeof lastMsg.content === "string"
        ? lastMsg.content
        : JSON.stringify(lastMsg.content);
  }

  return { finalAnswer };
}

// ============================================================
// 简单调用辅助函数（不需要流式展示时使用）
// ============================================================
export async function runAgent(
  agent: ReturnType<typeof createDeepAgent>,
  task: string,
  options?: { recursionLimit?: number }
) {
  const result = await agent.invoke(
    {
      messages: [new HumanMessage(task)],
    },
    {
      recursionLimit: options?.recursionLimit ?? 50,
    }
  );
  const messages = result.messages;
  return messages[messages.length - 1];
}
