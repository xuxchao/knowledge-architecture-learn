/**
 * 生成含表格的示例 PDF（无图片）
 *
 * 内容：
 *   Page 1 — 标题 + 知识库工具对比表
 *   Page 2 — 嵌入模型对比表 + 分块策略说明
 *
 * 用 pdfkit 手动绘制表格（pdfkit 无内置表格支持）
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../assets");
const OUTPUT_PATH = path.join(ASSETS_DIR, "sample-with-tables.pdf");
const FONT_PATH = "C:/Windows/Fonts/simhei.ttf";

/** 表格列定义 */
interface Column {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
}

/**
 * 在 PDF 上绘制表格
 */
function drawTable(
  doc: InstanceType<typeof PDFDocument>,
  columns: Column[],
  rows: string[][],
  startX: number,
  startY: number,
  rowHeight: number = 28
): number {
  const headerBg = "#2196F3";
  const headerColor = "#FFFFFF";
  const borderColor = "#CCCCCC";
  const altRowBg = "#F5F5F5";

  // 绘制表头背景
  doc.rect(startX, startY, columns.reduce((s, c) => s + c.width, 0), rowHeight)
    .fill(headerBg);

  // 绘制表头文字
  let xPos = startX;
  columns.forEach((col) => {
    const align = col.align || "left";
    const textX =
      align === "center"
        ? xPos + col.width / 2
        : align === "right"
        ? xPos + col.width - 10
        : xPos + 8;

    doc.font("SimHei")
      .fontSize(11)
      .fillColor(headerColor)
      .text(col.header, textX, startY + 8, {
        width: col.width - 16,
        align: align as "left" | "center" | "right",
      });
    xPos += col.width;
  });

  // 绘制数据行
  let yPos = startY + rowHeight;
  rows.forEach((row, rowIdx) => {
    // 交替行背景
    if (rowIdx % 2 === 1) {
      doc.rect(
        startX,
        yPos,
        columns.reduce((s, c) => s + c.width, 0),
        rowHeight
      ).fill(altRowBg);
    }

    // 绘制单元格文字
    xPos = startX;
    columns.forEach((col, colIdx) => {
      const align = col.align || "left";
      const textX =
        align === "center"
          ? xPos + col.width / 2
          : align === "right"
          ? xPos + col.width - 10
          : xPos + 8;

      doc.font("SimHei")
        .fontSize(10)
        .fillColor("#333333")
        .text(row[colIdx] || "", textX, yPos + 7, {
          width: col.width - 16,
          align: align as "left" | "center" | "right",
        });
      xPos += col.width;
    });

    // 绘制行边框（底线）
    doc.moveTo(startX, yPos + rowHeight)
      .lineTo(startX + columns.reduce((s, c) => s + c.width, 0), yPos + rowHeight)
      .strokeColor(borderColor)
      .lineWidth(0.5)
      .stroke();

    yPos += rowHeight;
  });

  // 绘制外边框和列分隔线
  const tableWidth = columns.reduce((s, c) => s + c.width, 0);
  const tableHeight = (rows.length + 1) * rowHeight;

  // 外边框
  doc.rect(startX, startY, tableWidth, tableHeight)
    .strokeColor(borderColor)
    .lineWidth(1)
    .stroke();

  // 列分隔线
  xPos = startX;
  columns.forEach((col, i) => {
    xPos += col.width;
    if (i < columns.length - 1) {
      doc.moveTo(xPos, startY)
        .lineTo(xPos, startY + tableHeight)
        .strokeColor(borderColor)
        .lineWidth(0.5)
        .stroke();
    }
  });

  return startY + tableHeight; // 返回表格底部 y 坐标
}

async function generatePDF() {
  // 1. 确保 assets 目录存在
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  // 2. 检查字体文件
  if (!fs.existsSync(FONT_PATH)) {
    console.error(`中文字体不存在: ${FONT_PATH}`);
    console.error("请确认 Windows 系统已安装 simhei.ttf（黑体）");
    process.exit(1);
  }

  // 3. 创建 PDF 文档
  const doc = new PDFDocument({
    size: "A4",
    info: {
      Title: "AI 知识库工具与模型对比",
      Author: "knowledge-architecture",
      Subject: "含表格的 PDF 解析示例",
      Keywords: "AI, 知识库, PDF, 表格, Markdown",
    },
  });
  const writeStream = fs.createWriteStream(OUTPUT_PATH);
  doc.pipe(writeStream);

  // 4. 注册中文字体
  doc.registerFont("SimHei", FONT_PATH);

  const pageWidth = 595.28; // A4 宽度（pt）
  const margin = 50;

  // ==================== Page 1: 工具对比表 ====================
  doc.font("SimHei").fontSize(24).fillColor("#1a1a1a");
  doc.text("AI 知识库工具与模型对比", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).fillColor("#555555");
  doc.text(
    "本文档包含两个表格，用于测试 PDF 转 Markdown 时表格结构的保留情况。" +
      "pdf-parse 提取表格时会丢失行列结构，文本按阅读顺序输出为纯文本。",
    { align: "left", lineGap: 4 }
  );
  doc.moveDown();

  doc.fontSize(16).fillColor("#333333");
  doc.text("一、PDF 解析工具对比");
  doc.moveDown(0.5);

  // 表格 1：PDF 解析工具对比
  const table1Columns: Column[] = [
    { header: "工具名称", width: 110, align: "left" },
    { header: "支持格式", width: 120, align: "left" },
    { header: "图片提取", width: 80, align: "center" },
    { header: "表格识别", width: 80, align: "center" },
    { header: "开源免费", width: 85, align: "center" },
  ];

  const table1Rows: string[][] = [
    ["pdf-parse", "PDF", "不支持", "不支持", "是"],
    ["LangChain PDFLoader", "PDF", "不支持", "不支持", "是"],
    ["pdfjs-dist", "PDF", "支持", "部分支持", "是"],
    ["Apache Tika", "PDF/Word/Excel", "支持", "部分支持", "是"],
    ["Unstructured", "PDF/Word/HTML", "支持", "支持", "是"],
    ["Camelot", "PDF", "不支持", "支持", "是"],
  ];

  const table1EndY = drawTable(
    doc,
    table1Columns,
    table1Rows,
    margin,
    doc.y,
    26
  );

  doc.y = table1EndY + 20;
  doc.fontSize(10).fillColor("#999999");
  doc.text("表 1：常见 PDF 解析工具能力对比", { align: "center" });

  // ==================== Page 2: 嵌入模型对比 + 分块策略 ====================
  doc.addPage();

  doc.font("SimHei").fontSize(16).fillColor("#333333");
  doc.text("二、Embedding 模型对比");
  doc.moveDown(0.5);

  doc.fontSize(12).fillColor("#555555");
  doc.text("以下是常用嵌入模型的参数对比，用于知识库向量化阶段选型参考：", {
    align: "left",
    lineGap: 4,
  });
  doc.moveDown();

  // 表格 2：嵌入模型对比
  const table2Columns: Column[] = [
    { header: "模型名称", width: 130, align: "left" },
    { header: "维度", width: 70, align: "center" },
    { header: "最大 Token", width: 100, align: "center" },
    { header: "提供商", width: 100, align: "left" },
    { header: "中文支持", width: 75, align: "center" },
  ];

  const table2Rows: string[][] = [
    ["text-embedding-v3", "1024", "8192", "阿里云", "优秀"],
    ["text-embedding-3-small", "1536", "8191", "OpenAI", "良好"],
    ["text-embedding-3-large", "3072", "8191", "OpenAI", "良好"],
    ["bge-large-zh-v1.5", "1024", "512", "智源研究院", "优秀"],
    ["m3e-base", "768", "512", "Moka AI", "优秀"],
    ["gte-large-zh", "1024", "512", "达摩院", "优秀"],
  ];

  const table2EndY = drawTable(
    doc,
    table2Columns,
    table2Rows,
    margin,
    doc.y,
    26
  );

  doc.y = table2EndY + 20;
  doc.fontSize(10).fillColor("#999999");
  doc.text("表 2：常用 Embedding 模型参数对比", { align: "center" });

  doc.moveDown(2);

  doc.fontSize(16).fillColor("#333333");
  doc.text("三、文本分块策略说明");
  doc.moveDown(0.5);

  doc.fontSize(12).fillColor("#555555");
  doc.text(
    "文本分块是知识库构建的关键步骤。常见的分块策略包括：" +
      "固定长度分块（按字符数切割）、语义分块（按段落或句子边界切割）、" +
      "滑动窗口分块（相邻块有重叠部分）和递归分块（先按大段落切，再按句子细分）。" +
      "选择合适的分块策略直接影响检索准确率和生成质量。",
    { align: "left", lineGap: 4 }
  );

  // ==================== 结束 ====================
  doc.end();

  return new Promise<void>((resolve, reject) => {
    writeStream.on("finish", () => {
      console.log(`PDF 已生成: ${OUTPUT_PATH}`);
      resolve();
    });
    writeStream.on("error", reject);
  });
}

generatePDF().catch((err) => {
  console.error("生成 PDF 失败:", err.message);
  process.exit(1);
});
