/**
 * 工具系统 — 适配 DeepAgents / LangChain 格式
 *
 * 04 项目使用自定义 Tool 接口（name/description/parameters/execute）
 * 05 项目使用 LangChain 的 tool() 函数 + zod schema
 *
 * 核心变化：
 *   - 04: 自定义接口 → 手动参数解析 + 返回 ToolResult 对象
 *   - 05: tool() + zod → 自动验证 + 返回字符串即为工具输出
 *
 * 工具逻辑完全复用 04 项目，只是格式适配。
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ============================================================
// calculator — 数学计算工具
// 逻辑复用 04 项目（安全正则 + new Function）
// ============================================================
export const calculator = tool(
  async ({ expression }) => {
    try {
      // 安全限制：只允许数字和基本运算符
      if (!/^[\d+\-*/().\s^]+$/.test(expression)) {
        return `错误：不安全的表达式：${expression}（只允许数字和 +-*/().^ 运算符）`;
      }
      // 将 ^ 替换为 **（幂运算）
      const safeExpr = expression.replace(/\^/g, "**");
      // 使用 Function 构造器安全计算（受限输入已验证）
      const result = new Function(`return (${safeExpr})`)();
      return `${expression} = ${result}`;
    } catch (e) {
      return `计算出错：${(e as Error).message}`;
    }
  },
  {
    name: "calculator",
    description:
      "进行数学计算，支持加减乘除和幂运算。输入表达式如 '2+3*4' 或 '10/2'",
    schema: z.object({
      expression: z.string().describe("数学表达式，如 '173*58+49'"),
    }),
  }
);

// ============================================================
// word_counter — 字数统计工具
// 逻辑复用 04 项目（统计总字符/中文/英文/数字）
// ============================================================
export const word_counter = tool(
  async ({ text }) => {
    // 总字符数（所有可见字符，包括数字）
    const totalChars = text.replace(/\s/g, "").length;
    // 中文字符数
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    // 英文单词数（连续字母序列）
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    // 数字字符数
    const digitChars = (text.match(/\d/g) || []).length;

    return `文本 "${text}"：总字符数=${totalChars}，中文字=${chineseChars}，英文单词=${englishWords}，数字字符=${digitChars}`;
  },
  {
    name: "word_counter",
    description:
      "统计一段文本的字符数、中文字数、英文单词数。对纯数字字符串统计其字符个数（如 '126' 有 3 个字符）",
    schema: z.object({
      text: z.string().describe("要统计的文本"),
    }),
  }
);

// ============================================================
// dictionary — 查词释义工具（模拟数据）
// MOCK_DICT 完全复用 04 项目
// ============================================================
const MOCK_DICT: Record<string, string> = {
  harness:
    "套具/驾驭装备；在软件架构中指'编排框架'——为 LLM 提供工具、记忆和执行循环的架构层",
  agent: "智能体/代理——能自主感知环境、推理决策并执行行动的 AI 系统",
  react:
    "ReAct 模式——Reason(推理) + Act(行动) 的循环，让 LLM 在思考与行动间交替前进",
  observe: "观察/感知——智能体从环境中获取信息的过程",
  chunking: "分块策略——将长文档切分为较小片段，便于向量化和检索",
  embedding:
    "嵌入/向量化——将文本转换为高维向量，用于语义搜索和相似度计算",
  rag: "检索增强生成(RAG)——先检索相关知识，再让 LLM 基于检索结果生成回答",
};

export const dictionary = tool(
  async ({ word }) => {
    const w = word.toLowerCase().trim();
    const definition = MOCK_DICT[w];
    if (definition) {
      return `【${w}】${definition}`;
    }
    return `未找到术语 "${w}" 的释义，目前支持查询：${Object.keys(MOCK_DICT).join(", ")}`;
  },
  {
    name: "dictionary",
    description:
      "查询 AI/知识库领域的术语释义。支持查询：harness, agent, react, observe, chunking, embedding, rag 等",
    schema: z.object({
      word: z.string().describe("要查询的术语"),
    }),
  }
);

// ============================================================
// 导出所有自定义工具
// ============================================================
export const customTools = [calculator, word_counter, dictionary];
