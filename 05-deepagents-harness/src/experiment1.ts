/**
 * 实验一：DeepAgents vs 04 手动 Harness（同 3 工具 + 同任务）
 *
 * 使用与 04 完全相同的 3 个工具和任务，通过 DeepAgents 执行。
 * 展示 DeepAgents 如何"开箱即用"地提供 Harness 功能。
 *
 * 对比要点：
 *   - 04 需要 5 个文件 500+ 行（types/memory/tools/harness/index）
 *   - 05 只需 createDeepAgent() 一行创建
 *   - 04 用 regex 解析 LLM 文本输出 → 05 用原生 function calling
 *   - 04 手动记忆管理 → 05 内置 LangGraph state
 */

import { createAgent, runAgentWithStreaming } from "./agent.js";

export async function experiment1() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  实验1：DeepAgents vs 04 手动 Harness（同任务对比）    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const agent = createAgent({
    systemPrompt:
      "你是一个严谨的 AI 助手。请使用提供的工具完成任务，每一步都必须通过工具来执行，不要凭自身知识直接给出答案。",
  });

  // 同 04 项目的任务
  const task =
    "计算 173 * 58 + 49 的结果，然后查一下 'harness' 这个术语是什么意思，最后统计 harness 释义文本的字符数";

  console.log(`任务: ${task}\n`);
  console.log("--- DeepAgents 执行过程 ---\n");

  const { finalAnswer } = await runAgentWithStreaming(agent, task);

  // 对比总结
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                     对比总结                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  04 手动 Harness:                                      ║");
  console.log("║    - types.ts (100+ 行类型定义)                         ║");
  console.log("║    - memory.ts (SimpleMemory 类)                        ║");
  console.log("║    - harness.ts (AgentHarness 类, 250+ 行)             ║");
  console.log("║    - 手动构建 ReAct Prompt (字符串拼接)                 ║");
  console.log("║    - 手动解析 LLM 输出 (regex 提取 Thought/Action)     ║");
  console.log("║    - 手动管理记忆 (entries 数组)                        ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  05 DeepAgents:                                        ║");
  console.log("║    - createDeepAgent({model, tools, systemPrompt})      ║");
  console.log("║    - 内置 LangGraph 工具调用循环 (无需手动 ReAct)      ║");
  console.log("║    - 原生 function calling (无需 regex 解析)            ║");
  console.log("║    - 内置状态管理 (LangGraph state)                     ║");
  console.log("║    - 内置规划、文件系统、子代理 (后续实验展示)          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n最终答案: ${finalAnswer}`);
}
