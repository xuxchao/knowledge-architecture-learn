/**
 * 记忆系统（Memory）— 智能体的短期记忆
 *
 * Memory 的核心作用：
 *   1. 存储每一步的推理、行动、观察结果
 *   2. 将这些信息格式化为上下文，供 LLM 在下一步使用
 *   3. 这样 LLM 就能"记住"自己做了什么、看到了什么
 *
 * 没有 Memory，LLM 每一步都是"瞎子"，无法做出连贯的决策
 */

import { Memory, MemoryEntry } from "./types.js";

export class SimpleMemory implements Memory {
  entries: MemoryEntry[] = [];

  add(role: MemoryEntry["role"], content: string): void {
    this.entries.push({
      role,
      content,
      timestamp: Date.now(),
    });
  }

  /** 将记忆格式化为 LLM 可读的文本上下文 */
  getSummary(): string {
    if (this.entries.length === 0) {
      return "（暂无历史记录）";
    }

    const roleLabels: Record<MemoryEntry["role"], string> = {
      observation: "观察",
      reasoning: "思考",
      action: "行动",
      result: "结果",
    };

    return this.entries
      .map((e, i) => `[第${i + 1}步] ${roleLabels[e.role]}：${e.content}`)
      .join("\n");
  }

  clear(): void {
    this.entries = [];
  }
}
