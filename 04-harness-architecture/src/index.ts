/**
 * 04-harness-architecture — Harness 架构最小 MVP demo
 *
 * 本 demo 展示 Harness 架构的核心概念：
 *   - 一个裸 LLM 只能"问答"，加了 Harness 就能"感知-推理-行动"循环
 *   - Harness = 编排层，负责：构建 Prompt → 调用 LLM → 解析输出 → 执行工具 → 更新记忆 → 循环
 *   - 这就是 ReAct（Reason + Act）模式的实现
 *
 * 运行方式：npx tsx src/index.ts
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { AgentHarness } from "./harness.js";

// 加载根目录 .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.error("❌ 缺少环境变量 DASHSCOPE_API_KEY，请在根目录 .env 中配置");
    process.exit(1);
  }

  // ============================================================
  // 对比实验：裸 LLM vs 加了 Harness 的智能体
  // ============================================================

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║       Harness 架构对比实验：裸 LLM vs 智能体            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // 创建 LLM Brain
  const brain = new ChatOpenAI({
    modelName: process.env.DASHSCOPE_MODEL,
    temperature: 0.3,
    apiKey,
    configuration: {
      baseURL: process.env.DASHSCOPE_BASE_URL,
    },
  });

  // 测试任务：需要多步推理 + 工具使用的复合任务
  // 强制 LLM 必须使用工具才能完成（大数计算容易出错，查词必须用工具）
  const task = "计算 173 * 58 + 49 的结果，然后查一下 'harness' 这个术语是什么意思，最后统计 harness 释义文本的字符数";

  // ============================================================
  // 实验一：裸 LLM — 一问一答，没有工具，没有记忆
  // ============================================================

  console.log("┌─────────────────────────────────────────┐");
  console.log("│  实验1：裸 LLM（没有 Harness）          │");
  console.log("└─────────────────────────────────────────┘\n");

  console.log(`🎯 任务：${task}`);
  console.log("🧠 直接调用 LLM...");

  const rawResponse = await brain.invoke(task);
  console.log(`\n🤖 LLM 直接回答：${String(rawResponse.content)}\n`);
  console.log("💡 裸 LLM 的问题：它只能凭自身知识回答，无法调用计算器精确计算");
  console.log("   也无法真正统计字符数——它只能'猜'答案\n");

  // ============================================================
  // 实验二：加了 Harness 的智能体 — ReAct 循环 + 工具 + 记忆
  // ============================================================

  console.log("┌─────────────────────────────────────────┐");
  console.log("│  实验2：Harness 智能体（有编排层）      │");
  console.log("└─────────────────────────────────────────┘\n");

  const harness = new AgentHarness(brain, { maxSteps: 8 });
  const result = await harness.run(task);

  // ============================================================
  // 对比总结
  // ============================================================

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                     对比总结                            ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  裸 LLM：一问一答，无法精确计算，只能猜测结果          ║`);
  console.log(`║  Harness：${result.totalSteps} 步完成，精确计算 + 真实统计       ║`);
  console.log(`║  最终答案：${result.finalAnswer}                           ║`);
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  Harness 架构的核心价值：                              ║");
  console.log("║  1. Prompt 构建 — 把工具列表+记忆注入 LLM 上下文      ║");
  console.log("║  2. 输出解析 — 从文本中提取 Thought/Action/Answer     ║");
  console.log("║  3. 工具执行 — 让 LLM 真正'动手'做事                  ║");
  console.log("║  4. 记忆管理 — 让 LLM 知道自己做了什么、看到了什么    ║");
  console.log("║  5. 循环控制 — ReAct 循环直到任务完成                 ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("❌ 运行出错：", err.message);
  process.exit(1);
});
