/**
 * 规则转换模块 — 利用 pdf-parse 2.x 结构化数据生成 Markdown
 *
 * 原则：
 * - pdf-parse 不解析标题/列表/引用，规则转换也不凭空猜测
 * - 只做 pdf-parse 真实提供的事情：段落（按空行分块）+ 表格（getTable）
 * - 不含任何启发式标题检测、序号匹配、引用块推断
 */

import type { TextResult, TableResult } from "pdf-parse";

/**
 * 转义表格单元格中的 `|` 为 `\|`，并将换行压成空格，避免破坏 Markdown 表结构
 */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/**
 * 规范化 Markdown：统一换行，压缩连续空行（4+ → 3），去首尾空白
 */
function cleanMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/**
 * 将 pdf-parse getTable() 返回的多种可能结构，统一成二维字符串数组
 *
 * 兼容形态：
 * - string[][]：已是行列结构
 * - 嵌套数组：逐项递归再扁平合并
 * - { rows } / { data }：取字段后继续递归
 * 无法识别时返回空数组
 */
function normalizePdfTable(raw: unknown): string[][] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    // 首元素仍是数组 → 视为「行 → 单元格」
    if (Array.isArray(raw[0])) {
      return (raw as unknown[][]).map((row) =>
        row.map((cell) => String(cell ?? "").trim())
      );
    }
    // 否则当作「多个表/多块」拼接
    const merged: string[][] = [];
    for (const item of raw) {
      merged.push(...normalizePdfTable(item));
    }
    return merged;
  }

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as { rows?: unknown; data?: unknown };
    if (obj.rows) return normalizePdfTable(obj.rows);
    if (obj.data) return normalizePdfTable(obj.data);
  }

  return [];
}

/**
 * 将二维字符串数组转为 Markdown 表格
 *
 * 改进点（吸收自外部项目）：
 * - 单元格 `|` 转义为 `\|`，换行压成空格，防止表结构破裂
 * - 按所有行的最大列数对齐，数据行不足补空串，避免内容截断
 * - 首行作为表头，紧接 `| --- |` 分隔行
 */
function tableToMarkdown(rows: string[][]): string {
  if (rows.length === 0) return "";

  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (maxCols === 0) return "";

  const lines: string[] = [];

  for (let r = 0; r < rows.length; r++) {
    const cells: string[] = [];
    for (let c = 0; c < maxCols; c++) {
      cells.push(escapeTableCell(rows[r][c] ?? ""));
    }
    lines.push("| " + cells.join(" | ") + " |");

    // 表头后插入分隔行
    if (r === 0) {
      lines.push("| " + Array(maxCols).fill("---").join(" | ") + " |");
    }
  }

  return lines.join("\n");
}

/**
 * 获取某页检测到的所有表格
 */
function getPageTables(
  pageNum: number,
  tableResult: TableResult
): string[][][] {
  const pageData = tableResult.pages.find((p) => p.num === pageNum);
  return pageData?.tables ?? [];
}

/**
 * 将 pdf-parse 2.x 的 TextResult + TableResult 转为 Markdown
 *
 * 处理流程：
 * 1. 逐页处理
 * 2. 有表格的页 → 文本去除表格数据行 + 插入 Markdown 表格
 * 3. 无表格的页 → 文本按空行分段落
 */
export function ruleBasedToMarkdown(
  textResult: TextResult,
  tableResult: TableResult
): string {
  const allBlocks: string[] = [];

  for (const page of textResult.pages) {
    allBlocks.push(`<!-- 第 ${page.num} 页 -->`);

    const pageTables = getPageTables(page.num, tableResult);
    // 归一化：兼容 pdf-parse 运行时可能返回的非标准结构
    const normalizedTables = pageTables.map((t) => normalizePdfTable(t));
    const hasTables = normalizedTables.some((t) => t.length > 0);

    if (hasTables) {
      // 有表格的页面：清理文本中的表格数据行（避免重复），保留说明文字
      const cleanedText = removeTableContentFromText(page.text, normalizedTables);
      const textBlocks = splitIntoParagraphs(cleanedText);
      allBlocks.push(...textBlocks);

      // 插入该页的表格
      for (const rows of normalizedTables) {
        if (rows.length > 0) {
          allBlocks.push("");
          allBlocks.push(tableToMarkdown(rows));
          allBlocks.push("");
        }
      }
    } else {
      // 无表格的页面：仅按空行分段落
      const pageBlocks = splitIntoParagraphs(page.text);
      allBlocks.push(...pageBlocks);
    }
  }

  return cleanMarkdown(allBlocks.join("\n\n"));
}

/**
 * 从文本中移除已检测到的表格内容行
 *
 * 策略：
 * 1. 将每个表格单元格按空白符拆分为独立单词，收集到集合中
 * 2. 对于文本行，检查该行中匹配的单词比例
 * 3. 匹配：精确相等 OR 相互包含（处理合并单元格的变体）
 * 4. 超过 50% 匹配 → 移除该行
 */
function removeTableContentFromText(
  text: string,
  tables: string[][][]
): string {
  // 收集所有表格单元格中的单词
  const cellWords: string[] = [];
  for (const table of tables) {
    for (const row of table) {
      for (const cell of row) {
        const parts = cell.trim().split(/\s+/);
        for (const part of parts) {
          if (part.length > 0) {
            cellWords.push(part);
          }
        }
      }
    }
  }

  const matchesCell = (textWord: string): boolean => {
    if (textWord.length < 2) return false;
    return cellWords.some(
      (cw) => cw === textWord || cw.includes(textWord) || textWord.includes(cw)
    );
  };

  const lines = text.split(/\r?\n/);
  const filtered: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      filtered.push(line);
      continue;
    }

    const words = trimmed.split(/\s+/);
    if (words.length === 0) {
      filtered.push(line);
      continue;
    }

    const tableWordCount = words.filter(matchesCell).length;
    const tableRatio = tableWordCount / words.length;

    if (tableRatio > 0.5) {
      continue;
    }

    filtered.push(line);
  }

  return filtered.join("\n");
}

/**
 * 将纯文本按空行分块为段落
 *
 * 不做任何结构推断：
 * - 标题不推测
 * - 列表不识别
 * - 引用块不标记
 */
function splitIntoParagraphs(text: string): string[] {
  const rawLines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(paragraph.join(" "));
      paragraph = [];
    }
  };

  for (const line of rawLines) {
    const trimmed = line.trim();

    // 空行 → 段落分隔
    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }

    paragraph.push(trimmed);
  }
  flushParagraph();

  return blocks;
}

/** 统计 Markdown 中的结构元素数量 */
export function analyzeMarkdown(md: string): {
  paragraphs: number;
  tables: number;
  totalChars: number;
} {
  const lines = md.split(/\r?\n/);

  let paragraphs = 0;
  let tables = 0;
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("|")) {
      // 检测 Markdown 表格分隔行
      if (/^\|[\s\-:| ]+\|$/.test(trimmed)) {
        tables++;
      }
      inParagraph = false;
    } else if (trimmed.startsWith("<!--")) {
      // 跳过 HTML 注释（页面标记）
      inParagraph = false;
    } else if (trimmed.length === 0) {
      inParagraph = false;
    } else if (!inParagraph) {
      paragraphs++;
      inParagraph = true;
    }
  }

  return {
    paragraphs,
    tables,
    totalChars: md.length,
  };
}
