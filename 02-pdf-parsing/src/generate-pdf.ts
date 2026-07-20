import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../assets");
const OUTPUT_PATH = path.join(ASSETS_DIR, "sample.pdf");
// 使用 Windows 系统黑体（独立 TTF 文件，兼容性最好）
const FONT_PATH = "C:/Windows/Fonts/simhei.ttf";

/**
 * 用 pngjs 生成一个 400x200 的渐变 PNG 图片
 * 返回 Buffer，可直接嵌入 PDF
 */
function createGradientPng(): Buffer {
  const width = 400;
  const height = 200;
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      // 水平渐变：蓝 -> 紫 -> 红
      const ratio = x / width;
      png.data[idx] = Math.floor(ratio * 255);           // R: 0 -> 255
      png.data[idx + 1] = Math.floor((1 - ratio) * 100);  // G: 100 -> 0
      png.data[idx + 2] = Math.floor(255 - ratio * 100);  // B: 255 -> 155
      png.data[idx + 3] = 255;                            // Alpha: 不透明
    }
  }

  // 在图片中间画一条白色横线作为装饰
  const midY = Math.floor(height / 2);
  for (let x = 50; x < width - 50; x++) {
    const idx = (width * midY + x) << 2;
    png.data[idx] = 255;
    png.data[idx + 1] = 255;
    png.data[idx + 2] = 255;
    png.data[idx + 3] = 255;
  }

  return PNG.sync.write(png);
}

/**
 * 生成示例 PDF 文件
 * 3 页内容：
 *   Page 1 — 纯文字（标题 + 知识库简介）
 *   Page 2 — 嵌入 PNG 光栅图片 + 说明文字
 *   Page 3 — 矢量图形 + 说明文字
 */
async function generatePDF() {
  // 1. 确保 assets 目录存在
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  // 2. 检查字体文件是否存在
  if (!fs.existsSync(FONT_PATH)) {
    console.error(`中文字体不存在: ${FONT_PATH}`);
    console.error("请确认 Windows 系统已安装 simhei.ttf（黑体）");
    process.exit(1);
  }

  // 3. 创建 PDF 文档
  const doc = new PDFDocument({
    size: "A4",
    info: {
      Title: "AI 知识库构建指南",
      Author: "knowledge-architecture",
      Subject: "PDF 解析示例文档",
      Keywords: "AI, 知识库, PDF, 文档解析",
    },
  });
  const writeStream = fs.createWriteStream(OUTPUT_PATH);
  doc.pipe(writeStream);

  // 4. 注册中文字体
  doc.registerFont("SimHei", FONT_PATH);

  // ==================== Page 1: 纯文字内容 ====================
  doc.font("SimHei").fontSize(24).fillColor("#1a1a1a");
  doc.text("AI 知识库构建指南", { align: "center" });
  doc.moveDown();

  doc.fontSize(16).fillColor("#333333");
  doc.text("一、概述", { align: "left" });
  doc.moveDown(0.5);

  doc.fontSize(12).fillColor("#555555");
  doc.text(
    "本文档是 knowledge-architecture 项目的示例 PDF，用于演示 PDF 文档解析的两种方法。" +
      "页面包含可提取的文字内容，后续页面还包含嵌入的图片和矢量图形。",
    { align: "left", lineGap: 4 }
  );
  doc.moveDown();

  doc.fontSize(16).fillColor("#333333");
  doc.text("二、知识库核心流程");
  doc.moveDown(0.5);

  doc.fontSize(12).fillColor("#555555");
  doc.text(
    "构建 AI 知识库通常包括以下步骤：\n" +
      "1. 文档收集 — 收集各类格式的文档（PDF、Word、Markdown 等）\n" +
      "2. 文档解析 — 将文档内容提取为纯文本\n" +
      "3. 文本分块 — 将长文本切分为语义连贯的片段\n" +
      "4. 向量化 — 使用 Embedding 模型将文本片段转为向量\n" +
      "5. 存储与索引 — 将向量存入向量数据库\n" +
      "6. 检索与生成 — 基于用户问题检索相关片段，交给 LLM 生成回答",
    { align: "left", lineGap: 4 }
  );
  doc.moveDown();

  doc.fontSize(10).fillColor("#999999");
  doc.text("（本页为纯文字内容，可被 pdf-parse 和 LangChain PDFLoader 提取）");

  // ==================== Page 2: 嵌入 PNG 光栅图片 ====================
  doc.addPage();

  doc.font("SimHei").fontSize(20).fillColor("#1a1a1a");
  doc.text("三、文档解析与图片", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).fillColor("#555555");
  doc.text(
    "本页包含一张嵌入的 PNG 光栅图片。文字解析工具（如 pdf-parse）只能提取文字，" +
      "无法提取图片内容。这是纯文字提取方法的固有限限。",
    { align: "left", lineGap: 4 }
  );
  doc.moveDown();

  // 生成并嵌入 PNG 图片
  const pngBuffer = createGradientPng();
  doc.image(pngBuffer, {
    fit: [400, 200],
    align: "center",
    valign: "center",
  });

  doc.moveDown(2);
  doc.fontSize(10).fillColor("#999999");
  doc.text("图 1：嵌入式光栅图片示例（由 pngjs 动态生成的渐变 PNG）", {
    align: "center",
  });
  doc.moveDown();

  doc.fontSize(12).fillColor("#555555");
  doc.text(
    "注意：上图是光栅图片，pdf-parse 和 LangChain PDFLoader 均无法提取图片中的内容。" +
      "如需提取图片，需要使用 pdfjs-dist 等更高级的库。",
    { align: "left", lineGap: 4 }
  );

  // ==================== Page 3: 矢量图形 + 文字 ====================
  doc.addPage();

  doc.font("SimHei").fontSize(20).fillColor("#1a1a1a");
  doc.text("四、向量化与检索", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).fillColor("#555555");
  doc.text(
    "本页包含矢量图形（矩形、圆形、三角形）和文字说明。" +
      "矢量图形与光栅图片一样，无法被文字解析工具提取。",
    { align: "left", lineGap: 4 }
  );
  doc.moveDown();

  // 绘制矢量图形
  // 矩形
  doc.lineWidth(2);
  doc.rect(100, 250, 180, 80).strokeColor("#2196F3").stroke();
  doc.font("SimHei").fontSize(12).fillColor("#333333");
  doc.text("文本分块", 130, 280);

  // 箭头
  doc.moveTo(280, 290).lineTo(330, 290).strokeColor("#666666").lineWidth(2).stroke();
  doc.polygon([325, 285], [335, 290], [325, 295]).fill("#666666");

  // 圆形
  doc.circle(400, 290, 40).fillColor("#FF5722").fill();
  doc.fontSize(11).fillColor("#FFFFFF");
  doc.text("向量化", 378, 285);

  // 箭头
  doc.moveTo(440, 290).lineTo(490, 290).strokeColor("#666666").lineWidth(2).stroke();
  doc.polygon([485, 285], [495, 290], [485, 295]).fill("#666666");

  // 三角形
  doc.save()
    .moveTo(500, 330)
    .lineTo(550, 250)
    .lineTo(600, 330)
    .closePath()
    .fillColor("#4CAF50")
    .fill()
    .restore();
  doc.fontSize(12).fillColor("#333333");
  doc.text("检索", 530, 335);

  doc.moveDown(6);
  doc.fontSize(12).fillColor("#555555");
  doc.text(
    "上图展示了知识库的核心流程：文本分块 -> 向量化 -> 检索。" +
      "这些矢量图形是 PDF 绘图指令，不是文字，也无法被文字解析工具提取。",
    { align: "left", lineGap: 4 }
  );
  doc.moveDown();

  doc.fontSize(10).fillColor("#999999");
  doc.text("（本页同时包含可提取文字和不可提取的矢量图形）");

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
