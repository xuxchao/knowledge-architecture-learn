/**
 * 单文件处理脚本 — 处理指定 PDF 生成中间产物和最终 MD
 * 用法: npx tsx src/run-single.ts <pdf路径>
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import type { TextResult, TableResult, InfoResult } from "pdf-parse";
import { ruleBasedToMarkdown, analyzeMarkdown } from "./rule-based.js";
import { aiBasedToMarkdown } from "./ai-based.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const OUTPUT_DIR = path.resolve(__dirname, "../output");

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("用法: npx tsx src/run-single.ts <pdf路径>");
    process.exit(1);
  }

  const pdfPath = path.resolve(args[0]);
  const pdfName = path.basename(pdfPath, path.extname(pdfPath));

  console.log(`源文件: ${pdfPath}`);
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF 文件不存在: ${pdfPath}`);
    process.exit(1);
  }
  console.log(`文件大小: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`);

  // 解析 PDF
  console.log("\n正在解析 PDF（pdf-parse 2.x）...");
  const dataBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: dataBuffer });

  const info: InfoResult = await parser.getInfo();
  console.log(`总页数: ${info.total}`);

  const textResult: TextResult = await parser.getText({
    lineEnforce: true,
    lineThreshold: 5.0,
    cellSeparator: "",
    cellThreshold: 10,
    pageJoiner: "",
    parseHyperlinks: true,
  });

  const tableResult: TableResult = await parser.getTable();
  await parser.destroy();

  console.log(`文档标题: ${info.info?.Title || "（无）"}`);
  console.log(`提取字符数: ${textResult.text.length}`);

  const tableCount = tableResult.pages.reduce((sum, p) => sum + p.tables.length, 0);
  console.log(`检测到表格数: ${tableCount}`);
  for (const page of tableResult.pages) {
    for (let i = 0; i < page.tables.length; i++) {
      const t = page.tables[i];
      console.log(`  第 ${page.num} 页 → 表格 ${i + 1}: ${t.length} 行 x ${t[0]?.length ?? 0} 列`);
    }
  }

  // 规则转换
  console.log("\n" + "=".repeat(60));
  console.log("规则转换（段落 + 表格）");
  console.log("=".repeat(60));
  const markdownRule = ruleBasedToMarkdown(textResult, tableResult);
  console.log(markdownRule);

  // AI 转换
  console.log("\n" + "=".repeat(60));
  console.log("AI 辅助转换（DashScope LLM）");
  console.log("=".repeat(60));
  console.log("正在调用 LLM...");
  const markdownAI = await aiBasedToMarkdown(textResult.text, tableResult);
  console.log(markdownAI);

  // 对比
  const ruleStats = analyzeMarkdown(markdownRule);
  const aiStats = analyzeMarkdown(markdownAI);
  console.log("\n" + "=".repeat(60));
  console.log("对比");
  console.log("=".repeat(60));
  console.log(`
┌─────────────────┬──────────────────────────────┬──────────────────────────────┐
│     维度        │       规则转换               │       AI 转换                │
├─────────────────┼──────────────────────────────┼──────────────────────────────┤
│ 总字符数        │ ${String(ruleStats.totalChars).padEnd(28)}│ ${String(aiStats.totalChars).padEnd(28)}│
│ 段落数          │ ${String(ruleStats.paragraphs).padEnd(28)}│ ${String(aiStats.paragraphs).padEnd(28)}│
│ Markdown 表格   │ ${String(ruleStats.tables).padEnd(28)}│ ${String(aiStats.tables).padEnd(28)}│
└─────────────────┴──────────────────────────────┴──────────────────────────────┘
`);

  // 保存
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const safeName = pdfName.replace(/[<>:"/\\|?*]/g, "_");
  fs.writeFileSync(path.join(OUTPUT_DIR, `${safeName}-rule.md`), markdownRule, "utf-8");
  fs.writeFileSync(path.join(OUTPUT_DIR, `${safeName}-ai.md`), markdownAI, "utf-8");
  fs.writeFileSync(path.join(OUTPUT_DIR, `${safeName}-raw.txt`), textResult.text, "utf-8");

  const tableJson = tableResult.pages.map((p) => ({
    page: p.num,
    tables: p.tables.map((t, i) => ({ index: i + 1, rows: t.length, cols: t[0]?.length ?? 0, data: t })),
  }));
  fs.writeFileSync(path.join(OUTPUT_DIR, `${safeName}-tables.json`), JSON.stringify(tableJson, null, 2), "utf-8");

  console.log(`\n输出文件（output/ 目录）:`);
  console.log(`  规则转换: output/${safeName}-rule.md`);
  console.log(`  AI 转换:  output/${safeName}-ai.md`);
  console.log(`  原始文本: output/${safeName}-raw.txt`);
  console.log(`  表格数据: output/${safeName}-tables.json`);
}

main().catch((err) => {
  console.error("运行出错:", err.message);
  console.error(err.stack);
  process.exit(1);
});
