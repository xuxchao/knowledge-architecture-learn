/**
 * 实验四：DeepAgents 子代理委派 (task) — 对照验证版
 *
 * 核心问题：如何确凿证明 task 工具创建了独立的子代理？
 *
 * 验证方法：对比两种执行模式的消息历史差异
 *   - 模式A（直接执行）：主代理直接调用 calculator/dictionary 等工具
 *     → 消息历史中能看到每一个工具调用和结果
 *   - 模式B（委派执行）：主代理通过 task 工具委派给子代理
 *     → 消息历史中只看到 task 工具调用，子代理的内部步骤被隐藏
 *
 * 这种差异就是子代理存在的铁证：
 *   如果 task 只是"假装"委派，那子代理内部的 calculator/dictionary
 *   调用就会出现在主消息历史中 — 但实际上它们不会出现。
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent, StateBackend } from "deepagents";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { customTools } from "./tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function createModel(): ChatOpenAI {
  return new ChatOpenAI({
    modelName: process.env.DASHSCOPE_MODEL!,
    temperature: 0.3,
    apiKey: process.env.DASHSCOPE_API_KEY!,
    configuration: { baseURL: process.env.DASHSCOPE_BASE_URL },
  });
}

// ============================================================
// 分析消息历史：提取主代理直接调用的工具列表
// 这是验证子代理的关键 — 如果 task 真的创建了子代理，
// 那么 calculator/dictionary 等调用只出现在 task 的内部，
// 不出现在主消息历史中
// ============================================================
function analyzeMessages(messages: (HumanMessage | AIMessage | ToolMessage)[]) {
  const directToolCalls: { name: string; args: any }[] = [];
  const taskToolCalls: { description: string; subagent_type: string }[] = [];
  const toolResults: { name: string; preview: string }[] = [];
  const aiTextResponses: string[] = [];

  for (const msg of messages) {
    if (msg instanceof AIMessage) {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          if (tc.name === "task") {
            // task 工具调用 = 委派给子代理
            taskToolCalls.push({
              description: (tc.args as any).description || "",
              subagent_type: (tc.args as any).subagent_type || "",
            });
          } else {
            // 其他工具调用 = 主代理直接执行
            directToolCalls.push({ name: tc.name, args: tc.args });
          }
        }
      } else {
        const content =
          typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        if (content.trim()) aiTextResponses.push(content);
      }
    } else if (msg instanceof ToolMessage) {
      const content =
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      // 从 ToolMessage 的 name 字段识别是哪个工具返回的结果
      const name = (msg as any).name || "unknown";
      toolResults.push({
        name,
        preview: content.length > 200 ? content.slice(0, 200) + "..." : content,
      });
    }
  }

  return { directToolCalls, taskToolCalls, toolResults, aiTextResponses };
}

// ============================================================
// 模式A：直接执行 — 主代理不使用 task 工具
// 不鼓励委派，让主代理自己调用 calculator/dictionary
// ============================================================
async function runDirectExecution() {
  console.log("\n┌────────────────────────────────────────────────────────┐");
  console.log("│  模式A：直接执行 — 主代理自己调用工具                  │");
  console.log("└────────────────────────────────────────────────────────┘\n");

  // 注意：不提及 task 工具，让主代理直接处理
  const agent = createDeepAgent({
    model: createModel(),
    tools: customTools,
    systemPrompt:
      "你是一个严谨的计算助手。请直接使用 calculator、dictionary 等工具完成任务，不要委派给其他代理。",
    backend: new StateBackend(),
  });

  const task =
    "请完成以下两个子任务：" +
    "1. 计算 (123 + 456) * 789 的结果 " +
    "2. 查询 'agent' 术语的定义。" +
    "完成后给出总结。";

  console.log(`任务: ${task}\n`);

  const result = await agent.invoke(
    { messages: [new HumanMessage(task)] },
    { recursionLimit: 80 }
  );

  const analysis = analyzeMessages(result.messages);

  // 展示执行过程
  console.log("--- 执行过程 ---");
  for (const msg of result.messages) {
    if (msg instanceof HumanMessage) {
      console.log(`\n[用户] ${(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)).slice(0, 100)}`);
    } else if (msg instanceof AIMessage) {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          console.log(`\n[主代理 → 工具] ${tc.name}`);
          console.log(`  参数: ${JSON.stringify(tc.args)}`);
        }
      } else {
        const c = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        if (c.trim()) console.log(`\n[主代理 回答] ${c.slice(0, 300)}`);
      }
    } else if (msg instanceof ToolMessage) {
      const c = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      console.log(`  结果: ${c.length > 200 ? c.slice(0, 200) + "..." : c}`);
    }
  }

  console.log("\n--- 模式A 消息历史分析 ---");
  console.log(`  主代理直接调用的工具: ${analysis.directToolCalls.map(t => t.name).join(", ") || "无"}`);
  console.log(`  task 工具调用次数: ${analysis.taskToolCalls.length}`);
  console.log(`  工具结果数: ${analysis.toolResults.length}`);
  console.log(`  消息总数: ${result.messages.length}`);

  return analysis;
}

// ============================================================
// 模式B：委派执行 — 主代理使用 task 工具委派给子代理
// ============================================================
async function runDelegatedExecution() {
  console.log("\n┌────────────────────────────────────────────────────────┐");
  console.log("│  模式B：委派执行 — 主代理通过 task 委派给子代理       │");
  console.log("└────────────────────────────────────────────────────────┘\n");

  const agent = createDeepAgent({
    model: createModel(),
    tools: customTools,
    systemPrompt:
      "你是一个善于委派任务的项目经理。对于可以分解的子任务，请使用 task 工具委派给子代理处理。" +
      "每个子代理有独立的上下文窗口，可以使用你提供的所有工具。尽量并行委派独立子任务。",
    backend: new StateBackend(),
  });

  const task =
    "请委派子代理完成以下两个子任务：" +
    "1. 计算 (123 + 456) * 789 的结果 " +
    "2. 查询 'agent' 术语的定义。" +
    "完成后读取子代理的结果并给出总结。";

  console.log(`任务: ${task}\n`);

  const result = await agent.invoke(
    { messages: [new HumanMessage(task)] },
    { recursionLimit: 100 }
  );

  const analysis = analyzeMessages(result.messages);

  // 展示执行过程
  console.log("--- 执行过程 ---");
  for (const msg of result.messages) {
    if (msg instanceof HumanMessage) {
      console.log(`\n[用户] ${(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)).slice(0, 100)}`);
    } else if (msg instanceof AIMessage) {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          if (tc.name === "task") {
            console.log(`\n[主代理 → task] 委派子代理`);
            console.log(`  子代理类型: ${(tc.args as any).subagent_type}`);
            console.log(`  任务描述: ${(tc.args as any).description}`);
          } else {
            console.log(`\n[主代理 → 工具] ${tc.name}`);
            console.log(`  参数: ${JSON.stringify(tc.args)}`);
          }
        }
      } else {
        const c = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        if (c.trim()) console.log(`\n[主代理 回答] ${c.slice(0, 300)}`);
      }
    } else if (msg instanceof ToolMessage) {
      const c = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const name = (msg as any).name || "unknown";
      if (name === "task") {
        // task 工具的结果 = 子代理的最终输出（子代理内部步骤被隐藏）
        console.log(`  [子代理返回结果] ${c.length > 300 ? c.slice(0, 300) + "..." : c}`);
      } else {
        console.log(`  结果: ${c.length > 200 ? c.slice(0, 200) + "..." : c}`);
      }
    }
  }

  console.log("\n--- 模式B 消息历史分析 ---");
  console.log(`  主代理直接调用的工具: ${analysis.directToolCalls.map(t => t.name).join(", ") || "无"}`);
  console.log(`  task 工具调用次数: ${analysis.taskToolCalls.length}`);
  if (analysis.taskToolCalls.length > 0) {
    analysis.taskToolCalls.forEach((tc, i) => {
      console.log(`    task#${i + 1}: 类型="${tc.subagent_type}", 描述="${tc.description.slice(0, 80)}"`);
    });
  }
  console.log(`  工具结果数: ${analysis.toolResults.length}`);
  console.log(`  消息总数: ${result.messages.length}`);

  return analysis;
}

// ============================================================
// 主函数：对照实验
// ============================================================
export async function experiment4() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  实验4：DeepAgents 子代理委派 — 对照验证版                ║");
  console.log("║  如何确凿证明 task 工具创建了独立的子代理？               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("验证原理：");
  console.log("  如果 task 真的创建了独立子代理，那么：");
  console.log("  → 模式A（直接执行）：消息历史中出现 calculator/dictionary 等调用");
  console.log("  → 模式B（委派执行）：消息历史中只出现 task 调用，");
  console.log("    子代理内部的 calculator/dictionary 调用被隐藏");
  console.log("  → 两者的消息历史有结构性差异，这就是子代理存在的铁证\n");

  // 运行模式A
  const analysisA = await runDirectExecution();

  // 运行模式B
  const analysisB = await runDelegatedExecution();

  // ============================================================
  // 对照对比
  // ============================================================
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  对照对比                                                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("┌──────────────┬────────────────────┬────────────────────┐");
  console.log("│  指标         │  模式A（直接执行）  │  模式B（委派执行）  │");
  console.log("├──────────────┼────────────────────┼────────────────────┤");
  console.log(
    `│  直接工具调用  │  ${analysisA.directToolCalls.map(t => t.name).join(", ") || "无".padEnd(18)}  │  ${analysisB.directToolCalls.map(t => t.name).join(", ") || "无".padEnd(18)}  │`
  );
  console.log(
    `│  task 调用数   │  ${String(analysisA.taskToolCalls.length).padEnd(18)}  │  ${String(analysisB.taskToolCalls.length).padEnd(18)}  │`
  );
  console.log(
    `│  工具结果数    │  ${String(analysisA.toolResults.length).padEnd(18)}  │  ${String(analysisB.toolResults.length).padEnd(18)}  │`
  );
  console.log(
    `│  消息总数      │  ${String(analysisA.directToolCalls.length + analysisA.taskToolCalls.length + analysisA.aiTextResponses.length + 1).padEnd(18)}  │  ${String(analysisB.directToolCalls.length + analysisB.taskToolCalls.length + analysisB.aiTextResponses.length + 1).padEnd(18)}  │`
  );
  console.log("└──────────────┴────────────────────┴────────────────────┘");

  // 关键结论
  console.log("\n--- 结论 ---");

  const aHasDirectCalc = analysisA.directToolCalls.some(t => t.name === "calculator");
  const bHasDirectCalc = analysisB.directToolCalls.some(t => t.name === "calculator");
  const bHasTask = analysisB.taskToolCalls.length > 0;

  if (aHasDirectCalc && !bHasDirectCalc && bHasTask) {
    console.log("  ✅ 子代理验证成功！");
    console.log("     模式A中 calculator/dictionary 在主消息历史中可见（直接执行）");
    console.log("     模式B中 calculator/dictionary 不在主消息历史中（被封装在子代理内部）");
    console.log("     模式B中出现了 task 工具调用，子代理的内部步骤被隐藏");
    console.log("     这证明 task 工具确实创建了独立子代理，而非简单封装");
  } else if (!bHasTask) {
    console.log("  ⚠️  主代理没有使用 task 工具");
    console.log("     可能原因：LLM 模型选择不委派，直接执行");
    console.log("     建议：调整 systemPrompt 更强烈地引导委派");
  } else if (bHasDirectCalc && bHasTask) {
    console.log("  ⚠️  混合模式：主代理同时直接调用工具和使用 task 委派");
    console.log("     主代理可能将部分任务委派，部分任务自己处理");
    console.log("     查看上方详细日志确认哪些工具是主代理直接调用的");
  }

  console.log("\n  子代理的核心特征：");
  console.log("  1. 独立上下文窗口 — 子代理看不到主代理的历史对话");
  console.log("  2. 内部步骤隐藏 — 主代理只看到子代理的最终结果");
  console.log("  3. 可以继承工具 — 子代理可以使用主代理注册的 calculator/dictionary 等");
  console.log("  4. 并行委派 — 多个 task 调用可以同时发起");
  console.log("  5. 这是 04 手动 Harness 完全无法实现的能力");
}
