import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
// 关键：绕过 pdf-parse index.js 的 module.parent ESM bug
// 直接从 lib/pdf-parse.js 导入核心解析函数
import pdfParse from "pdf-parse/lib/pdf-parse.js";

// 加载根目录 .env（子项目统一读取根目录配置）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const PDF_PATH = path.resolve(__dirname, "../assets/sample.pdf");

async function parseWithLangChain() {
  console.log("\n" + "=".repeat(60));
  console.log("方法一：LangChain PDFLoader");
  console.log("=".repeat(60));

  // splitPages: true — 每页返回一个独立的 Document 对象
  const loader = new PDFLoader(PDF_PATH, {
    splitPages: true,
  });
  const docs = await loader.load();

  console.log(`\n解析到 ${docs.length} 个文档（按页拆分）\n`);

  docs.forEach((doc, i) => {
    console.log(`--- 第 ${i + 1} 页 ---`);
    console.log(`元数据:`, JSON.stringify(doc.metadata, null, 2));
    console.log(
      `内容预览 (前 200 字符):\n${doc.pageContent.slice(0, 200)}${
        doc.pageContent.length > 200 ? "..." : ""
      }`
    );
    console.log(`总字符数: ${doc.pageContent.length}`);
    console.log();
  });

  return docs;
}

async function parseWithPdfParse() {
  console.log("\n" + "=".repeat(60));
  console.log("方法二：pdf-parse 直接调用");
  console.log("=".repeat(60));

  const dataBuffer = fs.readFileSync(PDF_PATH);
  const result = await pdfParse(dataBuffer);

  console.log(`\n总页数: ${result.numpages}`);
  console.log(`渲染页数: ${result.numrender}`);
  console.log(`PDF 版本: ${result.info.PDFFormatVersion}`);
  console.log(`是否含表单: ${result.info.IsAcroFormPresent}`);
  console.log(`标题: ${result.info.Title || "（无）"}`);
  console.log(`作者: ${result.info.Author || "（无）"}`);
  console.log(`主题: ${result.info.Subject || "（无）"}`);
  console.log(`总字符数: ${result.text.length}`);
  console.log(
    `\n文本预览 (前 300 字符):\n${result.text.slice(0, 300)}${
      result.text.length > 300 ? "..." : ""
    }`
  );

  return result;
}

function printSummary(
  langchainDocs: Awaited<ReturnType<typeof parseWithLangChain>>,
  pdfParseResult: Awaited<ReturnType<typeof parseWithPdfParse>>
) {
  console.log("\n" + "=".repeat(60));
  console.log("对比总结");
  console.log("=".repeat(60));

  console.log(`
┌─────────────────┬──────────────────────────────┬──────────────────────────────┐
│     维度        │     LangChain PDFLoader      │       pdf-parse              │
├─────────────────┼──────────────────────────────┼──────────────────────────────┤
│ 返回类型        │ Document[] (每页一个)        │ { text, numpages, info }     │
│ 文本粒度        │ 按页拆分                     │ 全文合并                     │
│ 元数据          │ metadata 对象 (含页码等)     │ info 对象 (含 PDF 信息)      │
│ 文档总数/页数   │ ${String(langchainDocs.length).padEnd(28)}│ ${String(pdfParseResult.numpages).padEnd(28)}│
│ 提取字符数      │ ${String(langchainDocs.reduce((s, d) => s + d.pageContent.length, 0)).padEnd(28)}│ ${String(pdfParseResult.text.length).padEnd(28)}│
│ 图片提取        │ 不支持                       │ 不支持                       │
│ 与 LangChain 集成│ 原生支持 (直接返回 Document) │ 需手动转换                   │
└─────────────────┴──────────────────────────────┴──────────────────────────────┘

结论：
- LangChain PDFLoader 适合需要按页处理、与 RAG 管道集成的场景
- pdf-parse 适合快速获取全文和 PDF 元信息的场景
- 两者底层都使用 pdf-parse 库，文字提取能力一致
- 嵌入的图片和矢量图形均无法被提取（需要 pdfjs-dist 等高级库）
`);
}

async function main() {
  // 1. 检查 PDF 文件是否存在
  if (!fs.existsSync(PDF_PATH)) {
    console.error("示例 PDF 文件不存在，请先运行:");
    console.error("  npx tsx src/generate-pdf.ts");
    console.error(`期望路径: ${PDF_PATH}`);
    process.exit(1);
  }

  console.log("PDF 文档解析对比测试");
  console.log(`目标文件: ${PDF_PATH}`);
  console.log(`文件大小: ${(fs.statSync(PDF_PATH).size / 1024).toFixed(2)} KB`);

  // 2. 方法一：LangChain PDFLoader
  const langchainDocs = await parseWithLangChain();

  // 3. 方法二：pdf-parse 直接调用
  const pdfParseResult = await parseWithPdfParse();

  // 4. 对比总结
  printSummary(langchainDocs, pdfParseResult);
}

main().catch((err) => {
  console.error("运行出错:", err.message);
  process.exit(1);
});
