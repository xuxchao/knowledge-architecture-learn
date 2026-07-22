/**
 * 工具系统（Tools）— 智能体的"手脚"
 *
 * 工具是 Harness 架构的关键组件：
 *   - 没有 Tools，LLM 只能"想"但不能"做"
 *   - 有了 Tools，智能体可以计算、搜索、读写文件、调用 API 等
 *   - 每个 Tool 都有清晰的描述，让 LLM 知道何时该用它
 *
 * 本 demo 提供三个简单工具：
 *   1. calculator — 数学计算
 *   2. word_counter — 统计字数
 *   3. dictionary — 查词释义（模拟）
 */

import { Tool, ToolResult } from "./types.js";

// ============================================================
// calculator — 数学计算工具
// ============================================================

const calculator: Tool = {
  name: "calculator",
  description: "进行数学计算，支持加减乘除和幂运算。输入表达式如 '2+3*4' 或 '10/2'",
  parameters: {
    expression: {
      type: "string",
      description: "数学表达式，如 '2+3*4'",
      required: true,
    },
  },
  execute: async (params) => {
    const expr = String(params.expression);
    try {
      // 安全限制：只允许数字和基本运算符
      if (!/^[\d+\-*/().\s^]+$/.test(expr)) {
        return {
          success: false,
          output: "",
          error: `不安全的表达式：${expr}（只允许数字和 +-*/().^ 运算符）`,
        };
      }
      // 将 ^ 替换为 Math.pow 调用
      const safeExpr = expr.replace(/\^/g, "**");
      // 使用 Function 构造器安全计算（受限输入已验证）
      const result = new Function(`return (${safeExpr})`)();
      return {
        success: true,
        output: `${expr} = ${result}`,
      };
    } catch (e) {
      return {
        success: false,
        output: "",
        error: `计算出错：${(e as Error).message}`,
      };
    }
  },
};

// ============================================================
// word_counter — 字数统计工具
// ============================================================

const word_counter: Tool = {
  name: "word_counter",
  description: "统计一段文本的字符数、中文字数、英文单词数。对纯数字字符串统计其字符个数（如 '126' 有 3 个字符）",
  parameters: {
    text: {
      type: "string",
      description: "要统计的文本",
      required: true,
    },
  },
  execute: async (params) => {
    const text = String(params.text);
    // 总字符数（所有可见字符，包括数字）
    const totalChars = text.replace(/\s/g, "").length;
    // 中文字符数
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    // 英文单词数（连续字母序列）
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    // 数字字符数
    const digitChars = (text.match(/\d/g) || []).length;

    return {
      success: true,
      output: `文本 "${text}"：总字符数=${totalChars}，中文字=${chineseChars}，英文单词=${englishWords}，数字字符=${digitChars}`,
    };
  },
};

// ============================================================
// dictionary — 查词释义工具（模拟数据）
// ============================================================

const MOCK_DICT: Record<string, string> = {
  harness: "套具/驾驭装备；在软件架构中指'编排框架'——为 LLM 提供工具、记忆和执行循环的架构层",
  agent: "智能体/代理——能自主感知环境、推理决策并执行行动的 AI 系统",
  react: "ReAct 模式——Reason(推理) + Act(行动) 的循环，让 LLM 在思考与行动间交替前进",
  observe: "观察/感知——智能体从环境中获取信息的过程",
  chunking: "分块策略——将长文档切分为较小片段，便于向量化和检索",
  embedding: "嵌入/向量化——将文本转换为高维向量，用于语义搜索和相似度计算",
  rag: "检索增强生成(RAG)——先检索相关知识，再让 LLM 基于检索结果生成回答",
};

const dictionary: Tool = {
  name: "dictionary",
  description: "查询 AI/知识库领域的术语释义。支持查询：harness, agent, react, observe, chunking, embedding, rag 等",
  parameters: {
    word: {
      type: "string",
      description: "要查询的术语",
      required: true,
    },
  },
  execute: async (params) => {
    const word = String(params.word).toLowerCase().trim();
    const definition = MOCK_DICT[word];

    if (definition) {
      return {
        success: true,
        output: `【${word}】${definition}`,
      };
    }
    return {
      success: false,
      output: "",
      error: `未找到术语 "${word}" 的释义，目前支持查询：${Object.keys(MOCK_DICT).join(", ")}`,
    };
  },
};

// ============================================================
// 导出所有工具
// ============================================================

export const allTools: Tool[] = [calculator, word_counter, dictionary];

/** 根据名称查找工具 */
export function findTool(name: string): Tool | undefined {
  return allTools.find((t) => t.name === name);
}

/** 生成工具描述文本（用于 LLM prompt） */
export function getToolDescriptions(): string {
  return allTools
    .map((t) => {
      const params = Object.entries(t.parameters)
        .map(([k, v]) => `  - ${k}: ${v.description} (${v.type}${v.required ? ", 必填" : ""})`)
        .join("\n");
      return `- ${t.name}: ${t.description}\n${params}`;
    })
    .join("\n\n");
}
