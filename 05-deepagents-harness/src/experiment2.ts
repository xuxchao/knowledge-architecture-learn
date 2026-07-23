/**
 * 实验二：DeepAgents 规划能力 (write_todos)
 *
 * DeepAgents 内置 write_todos 工具，Agent 可以自主创建待办事项列表并追踪进度。
 * 这是 04 手动 Harness 完全没有的能力。
 *
 * 展示要点：
 *   1. Agent 自动调用 write_todos 创建待办列表
 *   2. 每步完成后 Agent 更新 todo 状态
 *   3. Agent 使用 write_file 写入文件（StateBackend 内存文件系统）
 *   4. 这些都是 DeepAgents 内置功能，无需手动实现
 */

import { createAgent, runAgentWithStreaming } from "./agent.js";

export async function experiment2() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  实验2：DeepAgents 规划能力 (write_todos)              ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const agent = createAgent({
    systemPrompt:
      "你是一个善于规划的 AI 助手。面对复杂任务，请先用 write_todos 制定计划，再逐步执行。每完成一步，更新 todo 状态为 completed。",
  });

  const task =
    "请完成以下多步骤任务：" +
    "1. 查询 'rag' 术语定义 " +
    "2. 查询 'embedding' 术语定义 " +
    "3. 查询 'chunking' 术语定义 " +
    "4. 计算这三个术语释义的总字符数 " +
    "5. 将总结写入文件 summary.md";

  console.log(`任务: ${task}\n`);
  console.log("--- DeepAgents 规划 + 执行过程 ---\n");

  const { finalAnswer } = await runAgentWithStreaming(agent, task, {
    recursionLimit: 80,
  });

  console.log("\n--- 关键观察 ---");
  console.log("  1. Agent 自动调用 write_todos 创建待办列表");
  console.log("  2. 每步完成后 Agent 更新 todo 状态为 completed");
  console.log("  3. Agent 使用 write_file 写入文件（StateBackend 内存文件系统）");
  console.log("  4. 这些都是 DeepAgents 内置功能，无需手动实现");
  console.log(`\n最终答案: ${finalAnswer}`);
}
