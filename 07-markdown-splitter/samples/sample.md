# LangChain Markdown Splitter 示例文档

## 1. 项目概述

本项目演示如何使用 LangChain 的 `MarkdownTextSplitter` 来分割 Markdown 文档。
Markdown 是知识库中最常见的格式之一，按标题层级分割能保留语义结构。

## 2. 什么是 Text Splitter

Text Splitter 是 LangChain 中用于将长文本切分为短片段的工具。
在 RAG（检索增强生成）场景中，合理的分块策略直接影响检索质量。

### 2.1 常见分块策略

- **固定长度分块**：按字符数切分，简单但可能截断语义
- **递归分块**：按分隔符优先级递归切分，尽量保持完整句子
- **Markdown 分块**：按标题层级切分，保持文档结构

### 2.2 MarkdownTextSplitter 的优势

MarkdownTextSplitter 基于 `#` 标题层级进行分块，每个 chunk 会携带它所属的标题路径。
这对于知识库检索特别有用，因为可以在检索结果中展示内容的结构上下文。

## 3. 参数说明

### 3.1 chunkSize

每个 chunk 的最大字符数。值越小，分块越细，检索精度越高但上下文越少。

### 3.2 chunkOverlap

相邻 chunk 之间重叠的字符数。用于保证跨块边界的语义连续性，避免在句子中间截断导致信息丢失。

## 4. 代码块示例

```typescript
import { MarkdownTextSplitter } from "@langchain/textsplitters";

const splitter = new MarkdownTextSplitter({
  chunkSize: 500,
  chunkOverlap: 50,
});

const chunks = await splitter.splitText(markdownText);
```

## 5. 列表演示

Markdown 文档中常见的列表结构：

- 第一项：列表项也会被纳入分块范围
- 第二项：较长的列表项不会被强行拆分
- 第三项：除非超过 chunkSize 限制

## 6. 总结

合理选择 chunkSize 和 chunkOverlap 是 RAG 系统优化的关键。
MarkdownTextSplitter 适合处理结构化文档，能保持标题上下文。
