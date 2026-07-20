/**
 * PDF 转 Markdown — 主入口
 *
 * 流程：
 * 1. 用 pdf-parse 解析 PDF → 获取纯文本
 * 2. 规则转换 → Markdown（启发式规则）
 * 3. AI 转换 → Markdown（DashScope LLM）
 * 4. 打印两种结果并对比
 * 5. 将结果写入 output/ 目录
 *
 * 支持处理多个 PDF：
 * - sample.pdf（来自 02-pdf-parsing，含图片和矢量图形）
 * - sample-with-tables.pdf（本项目生成，含表格、无图片）
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
// 关键：绕过 pdf-parse index.js 的 module.parent ESM bug
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { ruleBasedToMarkdown, analyzeMarkdown } from "./rule-based.js";
import { aiBasedToMarkdown } from "./ai-based.js";

// 加载根目录 .env（子项目统一读取根目录配置）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const OUTPUT_DIR = path.resolve(__dirname, "../output");

// 待处理的 PDF 列表
const PDF_FILES = [
  {
    label: "含图片的 PDF（来自 02-pdf-parsing）",
    path: path.resolve(__dirname, "../../02-pdf-parsing/assets/sample.pdf"),
    outputPrefix: "rule-based",
    aiOutputPrefix: "ai-based",
    textPrefix: "raw-text",
  },
  {
    label: "含表格的 PDF（本项目生成）",
    path: path.resolve(__dirname, "../assets/sample-with-tables.pdf"),
    outputPrefix: "rule-based-tables",
    aiOutputPrefix: "ai-based-tables",
    textPrefix: "raw-text-tables",
  },
];

/**
 * 处理单个 PDF：解析 → 规则转换 → AI 转换 → 对比 → 保存
 */
async function processPDF(fileInfo: (typeof PDF_FILES)[0]) {
  const { label, path: pdfPath, outputPrefix, aiOutputPrefix, textPrefix } = fileInfo;

  console.log("\n" + "#".repeat(60));
  console.log(`# 处理: ${label}`);
  console.log("#".repeat(60));

  // 1. 检查 PDF 文件是否存在
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF 文件不存在: ${pdfPath}`);
    if (pdfPath.includes("sample-with-tables")) {
      console.error("请先运行: npx tsx src/generate-pdf.ts");
    }
    return;
  }

  console.log(`源文件: ${pdfPath}`);
  console.log(`文件大小: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`);

  // 2. 用 pdf-parse 解析 PDF
  console.log("\n正在解析 PDF...");
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfResult = await pdfParse(dataBuffer);

  console.log(`总页数: ${pdfResult.numpages}`);
  console.log(`标题: ${pdfResult.info.Title || "（无）"}`);
  console.log(`提取字符数: ${pdfResult.text.length}`);

  const rawText = pdfResult.text;

  // 3. 方法一：规则转换
  console.log("\n" + "=".repeat(60));
  console.log("方法一：规则转换（启发式规则）");
  console.log("=".repeat(60));

  const markdownRule = ruleBasedToMarkdown(rawText);
  console.log("\n--- 转换结果 ---\n");
  console.log(markdownRule);

  // 4. 方法二：AI 辅助转换
  console.log("\n" + "=".repeat(60));
  console.log("方法二：AI 辅助转换（DashScope LLM）");
  console.log("=".repeat(60));

  console.log("\n正在调用 LLM 进行智能转换...");
  const markdownAI = await aiBasedToMarkdown(rawText);
  console.log("\n--- 转换结果 ---\n");
  console.log(markdownAI);

  // 5. 对比总结
  console.log("\n" + "=".repeat(60));
  console.log("对比总结");
  console.log("=".repeat(60));

  const ruleStats = analyzeMarkdown(markdownRule);
  const aiStats = analyzeMarkdown(markdownAI);

  console.log(`
┌─────────────────┬──────────────────────────────┬──────────────────────────────┐
│     维度        │       规则转换               │       AI 转换                │
├─────────────────┼──────────────────────────────┼──────────────────────────────┤
│ 总字符数        │ ${String(ruleStats.totalChars).padEnd(28)}│ ${String(aiStats.totalChars).padEnd(28)}│
│ 标题数          │ ${String(ruleStats.headings).padEnd(28)}│ ${String(aiStats.headings).padEnd(28)}│
│ 有序列表项      │ ${String(ruleStats.orderedListItems).padEnd(28)}│ ${String(aiStats.orderedListItems).padEnd(28)}│
│ 无序列表项      │ ${String(ruleStats.unorderedListItems).padEnd(28)}│ ${String(aiStats.unorderedListItems).padEnd(28)}│
│ 引用块          │ ${String(ruleStats.blockquotes).padEnd(28)}│ ${String(aiStats.blockquotes).padEnd(28)}│
│ 段落数          │ ${String(ruleStats.paragraphs).padEnd(28)}│ ${String(aiStats.paragraphs).padEnd(28)}│
└─────────────────┴──────────────────────────────┴──────────────────────────────┘
`);

  // 6. 将结果写入 output/ 目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const ruleOutputPath = path.join(OUTPUT_DIR, `${outputPrefix}.md`);
  const aiOutputPath = path.join(OUTPUT_DIR, `${aiOutputPrefix}.md`);
  const rawTextPath = path.join(OUTPUT_DIR, `${textPrefix}.txt`);

  fs.writeFileSync(ruleOutputPath, markdownRule, "utf-8");
  fs.writeFileSync(aiOutputPath, markdownAI, "utf-8");
  fs.writeFileSync(rawTextPath, rawText, "utf-8");

  console.log(`规则转换结果已保存: ${ruleOutputPath}`);
  console.log(`AI 转换结果已保存: ${aiOutputPath}`);
  console.log(`原始解析文本已保存: ${rawTextPath}`);
}

async function main() {
  console.log("PDF 转 Markdown 转换工具");
  console.log(`待处理 ${PDF_FILES.length} 个 PDF 文件`);

  for (const fileInfo of PDF_FILES) {
    await processPDF(fileInfo);
  }

  console.log("\n" + "#".repeat(60));
  console.log("全部处理完成！");
  console.log("#".repeat(60));
  console.log(`输出目录: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("运行出错:", err.message);
  process.exit(1);
});
