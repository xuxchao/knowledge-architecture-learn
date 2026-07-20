/**
 * 规则转换模块 — 启发式规则将纯文本转为 Markdown
 *
 * pdf-parse 提取的文本是无结构的纯文本，
 * 本模块通过启发式规则推断标题、列表、段落等结构，生成 Markdown。
 */

/** 中英文句末标点 */
const SENTENCE_END_PUNCT = /[。．！？!?.…）)」』"']$/;

/** 中文括号注释行，如（本页为纯文字内容...） */
const PAREN_NOTE = /^[（(].*[）)]$/;

/** 有序列表项：1. / 1) / 1、 */
const ORDERED_LIST = /^\d+[.)、]\s*/;

/** 无序列表项：- / * / • */
const UNORDERED_LIST = /^[-*•]\s*/;

/**
 * 将 pdf-parse 提取的纯文本转为 Markdown
 *
 * 启发式规则：
 * - 短行（≤30字符）且不以句末标点结尾 → 标题 (##)
 * - 以 "数字." / "数字)" / "数字、" 开头 → 有序列表项
 * - 以 "-" / "*" / "•" 开头 → 无序列表项
 * - （...） 包裹的注释行 → Markdown 引用 (>)
 * - 连续非空行 → 段落（合并为一行）
 * - 空行 → 段落分隔
 */
export function ruleBasedToMarkdown(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(paragraph.join(" "));
      paragraph = [];
    }
  };

  for (const line of lines) {
    // 空行 → 段落分隔
    if (line.length === 0) {
      flushParagraph();
      continue;
    }

    // 括号注释行 → 引用
    if (PAREN_NOTE.test(line)) {
      flushParagraph();
      blocks.push(`> ${line}`);
      continue;
    }

    // 有序列表项
    if (ORDERED_LIST.test(line)) {
      flushParagraph();
      blocks.push(line); // 保持原文 "1. xxx" 格式，Markdown 原生支持
      continue;
    }

    // 无序列表项
    if (UNORDERED_LIST.test(line)) {
      flushParagraph();
      blocks.push(line.replace(UNORDERED_LIST, "- ")); // 统一为 Markdown 的 -
      continue;
    }

    // 短行且不以标点结尾 → 标题
    if (line.length <= 30 && !SENTENCE_END_PUNCT.test(line)) {
      flushParagraph();
      blocks.push(`## ${line}`);
      continue;
    }

    // 其他 → 段落内容
    paragraph.push(line);
  }
  flushParagraph();

  return blocks.join("\n\n");
}

/** 统计 Markdown 中的结构元素数量 */
export function analyzeMarkdown(md: string): {
  headings: number;
  orderedListItems: number;
  unorderedListItems: number;
  blockquotes: number;
  paragraphs: number;
  totalChars: number;
} {
  const lines = md.split(/\r?\n/);

  let headings = 0;
  let orderedListItems = 0;
  let unorderedListItems = 0;
  let blockquotes = 0;
  let paragraphs = 0;
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      headings++;
      inParagraph = false;
    } else if (ORDERED_LIST.test(trimmed)) {
      orderedListItems++;
      inParagraph = false;
    } else if (trimmed.startsWith("- ")) {
      unorderedListItems++;
      inParagraph = false;
    } else if (trimmed.startsWith("> ")) {
      blockquotes++;
      inParagraph = false;
    } else if (trimmed.length === 0) {
      inParagraph = false;
    } else if (!inParagraph) {
      paragraphs++;
      inParagraph = true;
    }
  }

  return {
    headings,
    orderedListItems,
    unorderedListItems,
    blockquotes,
    paragraphs,
    totalChars: md.length,
  };
}
