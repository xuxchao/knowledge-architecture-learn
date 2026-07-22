/**
 * Harness — 智能体的编排层（核心！）
 *
 * Harness 是整个架构的灵魂。它的职责：
 *   1. 构建 Prompt：把任务描述 + 工具列表 + 记忆上下文组合成完整的 prompt
 *   2. 调用 LLM：让 Brain（LLM）基于当前上下文推理决策
 *   3. 解析输出：从 LLM 的文本输出中提取推理（Thought）和行动（Action）
 *   4. 执行行动：调用对应工具，获取结果
 *   5. 更新记忆：把推理、行动、观察都记录到 Memory
 *   6. 循环往复：直到 LLM 给出最终答案或达到最大步数
 *
 * 这就是 ReAct 循环的实现：
 *   Observe → Reason → Act → Observe → Reason → Act → ...
 *
 * 对比没有 Harness 的"裸 LLM"：
 *   - 裸 LLM：一问一答，无法使用工具，无法记住上下文
 *   - 加了 Harness：变成智能体，能感知、推理、行动、记忆
 */

import { ChatOpenAI } from "@langchain/openai";
import { SimpleMemory } from "./memory.js";
import { findTool, getToolDescriptions } from "./tools.js";
import {
  HarnessConfig,
  HarnessResult,
  LLMResponse,
  StepResult,
} from "./types.js";

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_CONFIG: HarnessConfig = {
  maxSteps: 8,
  temperature: 0.3, // 较低温度，让推理更稳定
};

// ============================================================
// Prompt 模板 — 这就是 Harness 和 LLM 的"接口协议"
// ============================================================

/** 构建 ReAct Prompt — 这是整个 Harness 最关键的设计 */
function buildPrompt(task: string, memory: SimpleMemory): string {
  const history = memory.getSummary();
  const toolDesc = getToolDescriptions();

  return `你是一个严格遵循 ReAct 模式的智能体。你必须按步骤使用工具完成任务，绝对不能直接给出 Final Answer。

重要规则：
- 每一步只能使用一个工具
- 计算、查词、统计等操作都必须通过工具完成
- 只有在所有工具调用都完成后，才能输出 Final Answer
- 不要跳过工具步骤直接回答

## 可用工具
${toolDesc}

## 行动格式（严格遵守）
每一步必须输出：
Thought: [你的推理过程——为什么需要使用这个工具]
Action: [工具名称]
Action Input: [JSON 格式的工具参数]

当所有子任务都通过工具完成后，才能输出：
Thought: [总结所有观察结果]
Final Answer: [基于工具返回结果的最终答案]

## 历史记录
${history}

## 当前任务
${task}

请严格使用工具，一步一步执行。`;
}

// ============================================================
// 输出解析 — 从 LLM 的文本输出中提取结构化信息
// ============================================================

/** 解析 LLM 的文本输出为结构化的 LLMResponse */
function parseLLMOutput(output: string): LLMResponse {
  // 提取 Thought
  const thoughtMatch = output.match(/Thought:\s*(.+?)(?:\n|$)/i);
  const reasoning = thoughtMatch ? thoughtMatch[1].trim() : output.trim();

  // 提取 Final Answer
  const finalMatch = output.match(/Final Answer:\s*(.+)$/is);
  if (finalMatch) {
    return {
      reasoning,
      finalAnswer: finalMatch[1].trim(),
    };
  }

  // 提取 Action + Action Input
  const actionMatch = output.match(/Action:\s*(.+?)(?:\n|$)/i);
  const inputMatch = output.match(/Action Input:\s*(.+?)(?:\n|$)/i);

  if (actionMatch && inputMatch) {
    const toolName = actionMatch[1].trim();
    try {
      const params = JSON.parse(inputMatch[1].trim());
      return {
        reasoning,
        action: { tool: toolName, parameters: params },
      };
    } catch {
      // JSON 解析失败，把整个 input 当作字符串参数
      return {
        reasoning,
        action: {
          tool: toolName,
          parameters: { expression: inputMatch[1].trim(), text: inputMatch[1].trim(), word: inputMatch[1].trim() },
        },
      };
    }
  }

  // 无法解析为行动，当作纯推理/最终答案
  return {
    reasoning: output.trim(),
    finalAnswer: output.trim(),
  };
}

// ============================================================
// Agent Harness — 核心编排循环
// ============================================================

export class AgentHarness {
  private brain: ChatOpenAI;
  private memory: SimpleMemory;
  private config: HarnessConfig;

  constructor(brain: ChatOpenAI, config?: Partial<HarnessConfig>) {
    this.brain = brain;
    this.memory = new SimpleMemory();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 运行 Harness — 执行 ReAct 循环直到任务完成
   *
   * 这就是整个 Harness 架构的核心流程：
   *   while (step < maxSteps && notFinished) {
   *     1. 构建 Prompt（任务 + 记忆上下文 + 工具描述）
   *     2. 调用 LLM（Brain）进行推理
   *     3. 解析 LLM 输出（提取 Thought / Action / Final Answer）
   *     4. 如果有 Action → 执行工具 → 获取 Observation
   *     5. 记录到 Memory
   *     6. 继续循环
   *   }
   */
  async run(task: string): Promise<HarnessResult> {
    const steps: StepResult[] = [];

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎯 任务：${task}`);
    console.log(`${"=".repeat(60)}\n`);

    for (let step = 1; step <= this.config.maxSteps; step++) {
      console.log(`--- 第 ${step} 步 ---`);

      // 1️⃣ 构建 Prompt：把记忆和工具信息注入到 LLM 的上下文
      const prompt = buildPrompt(task, this.memory);
      console.log(`📝 构建 Prompt（含 ${this.memory.entries.length} 条历史记忆）`);

      // 2️⃣ 调用 Brain（LLM）：让它基于上下文推理决策
      console.log("🧠 调用 Brain（LLM）推理...");
      const rawOutput = await this.brain.invoke(prompt);
      const outputText = String(rawOutput.content);

      // 3️⃣ 解析 LLM 输出：提取推理过程和行动指令
      const parsed = parseLLMOutput(outputText);
      console.log(`💭 推理：${parsed.reasoning}`);

      // 记录推理到记忆
      this.memory.add("reasoning", parsed.reasoning);

      // 4️⃣ 判断：LLM 是否给出了最终答案？
      if (parsed.finalAnswer) {
        console.log(`✅ 最终答案：${parsed.finalAnswer}`);
        this.memory.add("result", parsed.finalAnswer);

        steps.push({
          stepNumber: step,
          reasoning: parsed.reasoning,
          finalAnswer: parsed.finalAnswer,
        });

        return {
          task,
          steps,
          finalAnswer: parsed.finalAnswer,
          totalSteps: step,
          success: true,
        };
      }

      // 5️⃣ 执行行动：调用工具
      if (parsed.action) {
        const { tool, parameters } = parsed.action;
        console.log(`🔧 行动：调用工具 "${tool}"，参数：${JSON.stringify(parameters)}`);

        // 记录行动到记忆
        this.memory.add("action", `使用 ${tool}，参数：${JSON.stringify(parameters)}`);

        // 查找并执行工具
        const toolInstance = findTool(tool);
        if (!toolInstance) {
          const errorMsg = `未知工具 "${tool}"，可用工具：${["calculator", "word_counter", "dictionary"].join(", ")}`;
          console.log(`❌ ${errorMsg}`);
          this.memory.add("observation", errorMsg);

          steps.push({
            stepNumber: step,
            reasoning: parsed.reasoning,
            action: `调用 ${tool}（不存在）`,
            observation: errorMsg,
          });
          continue;
        }

        const result = await toolInstance.execute(parameters);
        const observation = result.success
          ? result.output
          : `工具执行失败：${result.error}`;
        console.log(`👁️ 观察：${observation}`);

        // 6️⃣ 记录观察结果到记忆 — 这就是 "Observe" 步骤
        this.memory.add("observation", observation);

        steps.push({
          stepNumber: step,
          reasoning: parsed.reasoning,
          action: `调用 ${tool}`,
          observation,
        });
      }
    }

    // 达到最大步数仍未完成
    const fallback = "达到最大步数限制，未能完成任务";
    console.log(`⚠️ ${fallback}`);
    return {
      task,
      steps,
      finalAnswer: fallback,
      totalSteps: this.config.maxSteps,
      success: false,
    };
  }
}
