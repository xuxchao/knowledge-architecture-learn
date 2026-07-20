/**
 * AI 辅助转换模块 — 用 DashScope LLM 将纯文本智能转为 Markdown
 *
 * pdf-parse 提取的文本丢失了文档结构信息（标题层级、列表嵌套等）。
 * 规则转换只能做简单的模式匹配，而 LLM 能理解语义，生成更准确的结构化 Markdown。
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// 加载根目录 .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SYSTEM_PROMPT = `你是一个文档格式转换助手。你的任务是将 PDF 提取的纯文本转换为结构良好的 Markdown 格式。

转换规则：
1. 识别文档的标题和各级小标题，使用 # / ## / ### 等 Markdown 标题标记
2. 识别列表内容（如编号步骤、项目符号），使用 Markdown 列表格式
3. 识别正文段落，保持段落间距
4. 识别注释、备注类内容，使用 Markdown 引用 (>) 格式
5. 保留原文的所有信息，不要遗漏或编造内容
6. 不要添加原文中不存在的内容
7. 直接输出 Markdown 内容，不要用代码块包裹，不要加任何解释说明

请将以下纯文本转换为 Markdown：`;

/**
 * 用 DashScope LLM 将纯文本转为结构化 Markdown
 *
 * @param text pdf-parse 提取的纯文本
 * @returns LLM 生成的 Markdown 文本
 */
export async function aiBasedToMarkdown(text: string): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "缺少环境变量 DASHSCOPE_API_KEY，请在根目录 .env 中配置"
    );
  }

  // 创建 ChatOpenAI 实例，指向阿里千问 DashScope OpenAI 兼容接口
  const model = new ChatOpenAI({
    modelName: process.env.DASHSCOPE_MODEL,
    temperature: 0.3, // 偏低，保证输出稳定
    apiKey,
    configuration: {
      baseURL: process.env.DASHSCOPE_BASE_URL,
    },
  });

  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(text),
  ]);

  let content = response.content as string;

  // LLM 有时会用 ```markdown ... ``` 包裹输出，去掉外层代码块
  content = content.trim();
  const codeFence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/;
  const match = content.match(codeFence);
  if (match) {
    content = match[1].trim();
  }

  return content;
}
