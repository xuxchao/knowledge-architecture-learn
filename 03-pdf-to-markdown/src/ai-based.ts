/**
 * AI 辅助转换模块 — 用 DashScope LLM 将结构化 PDF 数据智能转为 Markdown
 *
 * v2 改进：除传入纯文本外，还传入 getTable() 检测到的表格结构化数据，
 * 帮助 LLM 生成更准确的 Markdown 表格。
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { TableResult } from "pdf-parse";

// 加载根目录 .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/**
 * 将 TableResult 中的表格格式化为可嵌入 prompt 的文本
 */
function formatTablesForPrompt(tableResult: TableResult): string {
  const parts: string[] = [];

  for (const page of tableResult.pages) {
    if (page.tables.length === 0) continue;

    for (let i = 0; i < page.tables.length; i++) {
      const table = page.tables[i];
      if (table.length === 0) continue;

      parts.push(
        `[第 ${page.num} 页，表格 ${i + 1}：${table.length} 行 x ${table[0]?.length ?? 0} 列]`
      );

      // 用 tab 分隔的纯文本表格
      for (const row of table) {
        parts.push(row.join("\t"));
      }

      parts.push(""); // 空行分隔
    }
  }

  return parts.join("\n");
}

const SYSTEM_PROMPT = `你是一个文档格式转换助手。你的任务是将 PDF 提取的纯文本转换为结构良好的 Markdown 格式。

转换规则：
1. 识别文档的标题和各级小标题，使用 # / ## / ### 等 Markdown 标题标记
2. 识别列表内容（如编号步骤、项目符号），使用 Markdown 列表格式
3. 识别正文段落，保持段落间距
4. 识别注释、备注类内容，使用 Markdown 引用 (>) 格式
5. 如果提供了"检测到的表格"数据，请将它们转换为标准 Markdown 表格格式
   （| 列1 | 列2 |），第一行作为表头，使用 --- 作为分隔行
6. 保留原文的所有信息，不要遗漏或编造内容
7. 不要添加原文中不存在的内容
8. 直接输出 Markdown 内容，不要用代码块包裹，不要加任何解释说明

请将以下纯文本转换为 Markdown：`;

/**
 * 用 DashScope LLM 将纯文本 + 表格数据转为结构化 Markdown
 *
 * @param text pdf-parse TextResult 提取的纯文本
 * @param tableResult pdf-parse TableResult 检测到的表格
 * @returns LLM 生成的 Markdown 文本
 */
export async function aiBasedToMarkdown(
  text: string,
  tableResult?: TableResult
): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "缺少环境变量 DASHSCOPE_API_KEY，请在根目录 .env 中配置"
    );
  }

  // 创建 ChatOpenAI 实例，指向阿里千问 DashScope OpenAI 兼容接口
  const model = new ChatOpenAI({
    modelName: process.env.DASHSCOPE_MODEL,
    temperature: 0.3,
    apiKey,
    configuration: {
      baseURL: process.env.DASHSCOPE_BASE_URL,
    },
  });

  // 构建 human message：纯文本 + 表格数据（如果有）
  let humanContent = text;

  if (tableResult) {
    const tableCount = tableResult.pages.reduce(
      (sum, p) => sum + p.tables.length,
      0
    );
    if (tableCount > 0) {
      const tableText = formatTablesForPrompt(tableResult);
      humanContent = `以下是 PDF 提取的纯文本内容：

${text}

---

以下是在上述 PDF 中检测到的表格数据（共 ${tableCount} 个表格），请在对应的位置将它们转换为 Markdown 表格：

${tableText}`;
    }
  }

  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(humanContent),
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
