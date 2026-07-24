import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, basename, dirname, extname } from "path";
import { MarkdownTextSplitter } from "@langchain/textsplitters";

/**
 * Markdown Splitter MVP
 *
 * 用法：
 *   npx tsx src/index.ts <md文件路径>
 *   npx tsx src/index.ts                    # 默认解析 samples/sample.md
 *
 * 功能：
 *   1. 读取指定的 Markdown 文件
 *   2. 用 LangChain MarkdownTextSplitter 按标题层级分割
 *   3. 输出每个 chunk 的序号、标题上下文、字符数、内容预览
 *   4. 将全量分割结果输出到 output/ 目录下的 JSON 文件
 */

/**
 * 从 chunk 文本中提取第一个标题行作为标题上下文
 */
function extractHeader(chunk: string): string {
  const match = chunk.match(/^#{1,6}\s+.+$/m);
  return match ? match[0] : "（无标题行）";
}

async function main() {
  // ── 1. 解析命令行参数，确定要处理的文件 ──
  const inputArg = process.argv[2];
  const filePath = inputArg
    ? resolve(inputArg)
    : resolve(import.meta.dirname, "../samples/sample.md");

  console.log(`\n📄 文件：${filePath}`);
  console.log(`   文件名：${basename(filePath)}\n`);

  // ── 2. 读取文件内容 ──
  let rawText: string;
  try {
    rawText = readFileSync(filePath, "utf-8");
  } catch (err: any) {
    console.error(`❌ 读取文件失败：${err.message}`);
    console.error(`   请检查路径是否正确，或使用：npx tsx src/index.ts <文件路径>`);
    process.exit(1);
  }

  console.log(`📊 原始大小：${rawText.length} 字符\n`);
  console.log(`${"═".repeat(70)}`);

  // ── 3. 创建 MarkdownTextSplitter 实例 ──
  const splitter = new MarkdownTextSplitter({
    chunkSize: 50,
    chunkOverlap: 10,
  });

  // ── 4. 执行分割 ──
  const chunks = await splitter.splitText(rawText);

  // ── 5. 终端输出摘要 ──
  console.log(`✂️  分割完成：共 ${chunks.length} 个 chunk\n`);

  chunks.forEach((chunk, i) => {
    const preview = chunk.slice(0, 80).replace(/\n/g, " ");
    const ellipsis = chunk.length > 80 ? "..." : "";
    const header = extractHeader(chunk);

    console.log(`${"─".repeat(70)}`);
    console.log(`Chunk #${i + 1}  |  ${chunk.length} 字符`);
    console.log(`标题上下文：${header}`);
    console.log(`内容预览：${preview}${ellipsis}`);
  });

  // ── 6. 组装结构化数据并输出 JSON ──
  const structuredChunks = chunks.map((chunk, i) => ({
    index: i + 1,
    charCount: chunk.length,
    header: extractHeader(chunk),
    content: chunk,
    preview: chunk.slice(0, 80).replace(/\n/g, " ") + (chunk.length > 80 ? "..." : ""),
  }));

  const result = {
    source: filePath,
    fileName: basename(filePath),
    sourceSize: rawText.length,
    chunkCount: chunks.length,
    splitConfig: { chunkSize: 500, chunkOverlap: 50 },
    chunks: structuredChunks,
  };

  // 输出到 output/ 目录，文件名基于输入文件名
  const baseName = basename(filePath, extname(filePath));
  const outputDir = resolve(import.meta.dirname, "../output");
  mkdirSync(outputDir, { recursive: true });

  const jsonPath = resolve(outputDir, `${baseName}.chunks.json`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf-8");

  console.log(`${"═".repeat(70)}`);
  console.log(`\n💾 JSON 已输出：${jsonPath}\n`);
}

main().catch((err) => {
  console.error("❌ 运行出错：", err);
  process.exit(1);
});
