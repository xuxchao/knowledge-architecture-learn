/**
 * PDF 转 Markdown — 主入口
 *
 * 流程：
 * 1. 用 pdf-parse 2.x 解析 PDF → 获取结构化数据（TextResult + TableResult）
 * 2. 规则转换 → Markdown（利用 v2 的 getTable() 生成 Markdown 表格）
 * 3. AI 转换 → Markdown（DashScope LLM，传入结构化数据）
 * 4. 打印两种结果并对比
 * 5. 将结果写入 output/ 目录
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import type { TextResult, TableResult, InfoResult } from "pdf-parse";
import { ruleBasedToMarkdown, analyzeMarkdown } from "./rule-based.js";
import { aiBasedToMarkdown } from "./ai-based.js";

// 加载根目录 .env（子项目统一读取根目录配置）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const OUTPUT_DIR = path.resolve(__dirname, "../output");

// 待处理的 PDF 列表
interface PDFFileInfo {
  label: string;
  path: string;
  outputPrefix: string;
  aiOutputPrefix: string;
  textPrefix: string;
  tablePrefix: string;
}

const PDF_FILES: PDFFileInfo[] = [
  {
    label: "含图片的 PDF（来自 02-pdf-parsing）",
    path: path.resolve(__dirname, "../../02-pdf-parsing/assets/sample.pdf"),
    outputPrefix: "rule-based",
    aiOutputPrefix: "ai-based",
    textPrefix: "raw-text",
    tablePrefix: "tables",
  },
  {
    label: "含表格的 PDF（本项目生成）",
    path: path.resolve(__dirname, "../assets/sample-with-tables.pdf"),
    outputPrefix: "rule-based-tables",
    aiOutputPrefix: "ai-based-tables",
    textPrefix: "raw-text-tables",
    tablePrefix: "tables",
  },
];

/**
 * 处理单个 PDF：解析 → 规则转换 → AI 转换 → 对比 → 保存
 */
async function processPDF(fileInfo: PDFFileInfo) {
  const { label, path: pdfPath, outputPrefix, aiOutputPrefix, textPrefix, tablePrefix } = fileInfo;

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

  // 2. 用 pdf-parse 2.x 解析 PDF
  console.log("\n正在解析 PDF（pdf-parse 2.x）...");
  const dataBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: dataBuffer });

  // 获取文档元信息
  const info: InfoResult = await parser.getInfo();
  console.log(`总页数: ${info.total}`);

  // 文本解析参数：保持纯文本格式，表格由 getTable() 单独提取
  const textParams = {
    lineEnforce: true,
    lineThreshold: 5.0,
    cellSeparator: "", // 不插入列分隔符，表格用 getTable() 数据替代
    cellThreshold: 10,
    pageJoiner: "",
    parseHyperlinks: true,
  };

  // 提取文本（含 per-page 结构化信息）
  const textResult: TextResult = await parser.getText(textParams);

  // 提取表格（利用 v2 原生表格检测）
  const tableResult: TableResult = await parser.getTable();

  // 清理
  await parser.destroy();

  console.log(`文档标题: ${info.info?.Title || "（无）"}`);
  console.log(`提取字符数: ${textResult.text.length}`);

  const tableCount = tableResult.pages.reduce(
    (sum, p) => sum + p.tables.length,
    0
  );
  console.log(`检测到表格数: ${tableCount}`);
  if (tableCount > 0) {
    tableResult.pages.forEach((page) => {
      page.tables.forEach((table, idx) => {
        console.log(
          `  第 ${page.num} 页 → 表格 ${idx + 1}: ${table.length} 行 x ${table[0]?.length ?? 0} 列`
        );
      });
    });
  }

  // 3. 方法一：规则转换（利用 v2 结构化数据）
  console.log("\n" + "=".repeat(60));
  console.log("方法一：规则转换（启发式规则 + v2 表格提取）");
  console.log("=".repeat(60));

  const markdownRule = ruleBasedToMarkdown(textResult, tableResult);
  console.log("\n--- 转换结果 ---\n");
  console.log(markdownRule);

  // 4. 方法二：AI 辅助转换
  console.log("\n" + "=".repeat(60));
  console.log("方法二：AI 辅助转换（DashScope LLM + 结构化数据）");
  console.log("=".repeat(60));

  console.log("\n正在调用 LLM 进行智能转换...");
  const markdownAI = await aiBasedToMarkdown(textResult.text, tableResult);
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
│ 段落数          │ ${String(ruleStats.paragraphs).padEnd(28)}│ ${String(aiStats.paragraphs).padEnd(28)}│
│ Markdown 表格   │ ${String(ruleStats.tables).padEnd(28)}│ ${String(aiStats.tables).padEnd(28)}│
└─────────────────┴──────────────────────────────┴──────────────────────────────┘
`);

  // 6. 将结果写入 output/ 目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const ruleOutputPath = path.join(OUTPUT_DIR, `${outputPrefix}.md`);
  const aiOutputPath = path.join(OUTPUT_DIR, `${aiOutputPrefix}.md`);
  const rawTextPath = path.join(OUTPUT_DIR, `${textPrefix}.txt`);
  const tableJsonPath = path.join(OUTPUT_DIR, `${tablePrefix}.json`);

  fs.writeFileSync(ruleOutputPath, markdownRule, "utf-8");
  fs.writeFileSync(aiOutputPath, markdownAI, "utf-8");
  fs.writeFileSync(rawTextPath, textResult.text, "utf-8");

  // 保存表格检测结果（供参考）
  const tableJson = tableResult.pages.map((p) => ({
    page: p.num,
    tables: p.tables.map((t, i) => ({
      index: i + 1,
      rows: t.length,
      cols: t[0]?.length ?? 0,
      data: t,
    })),
  }));
  fs.writeFileSync(tableJsonPath, JSON.stringify(tableJson, null, 2), "utf-8");

  console.log(`规则转换结果已保存: ${ruleOutputPath}`);
  console.log(`AI 转换结果已保存: ${aiOutputPath}`);
  console.log(`原始解析文本已保存: ${rawTextPath}`);
  console.log(`表格检测结果已保存: ${tableJsonPath}`);
}

async function main() {
  console.log("PDF 转 Markdown 转换工具（pdf-parse 2.x）");
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
