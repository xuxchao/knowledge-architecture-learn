/**
 * 实验三：DeepAgents 文件系统操作
 *
 * DeepAgents 内置文件系统工具 (write_file/read_file/edit_file/ls/grep)，
 * 使用 StateBackend 内存中的虚拟文件系统。
 * 展示自定义工具 (dictionary, word_counter) 与内置文件系统工具的无缝协作。
 *
 * 这是 04 手动 Harness 完全没有的能力。
 */

import { createAgent, runAgentWithStreaming } from "./agent.js";

export async function experiment3() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  实验3：DeepAgents 文件系统操作                        ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const agent = createAgent({
    systemPrompt:
      "你是一个文件管理助手。你可以使用文件系统工具创建、读取、编辑文件，也可以使用 dictionary 查询术语定义。",
  });

  const task =
    "创建一个名为 glossary.md 的文件，" +
    "写入 'harness' 和 'agent' 的术语定义（使用 dictionary 工具查询）。" +
    "然后用 edit_file 在文件末尾添加 'react' 的定义。" +
    "最后读取文件内容并统计总字符数。";

  console.log(`任务: ${task}\n`);
  console.log("--- DeepAgents 文件系统操作过程 ---\n");

  const { finalAnswer } = await runAgentWithStreaming(agent, task, {
    recursionLimit: 80,
  });

  console.log("\n--- 关键观察 ---");
  console.log("  1. write_file — 创建新文件");
  console.log("  2. read_file — 读取文件内容（带行号）");
  console.log("  3. edit_file — 精确字符串替换编辑");
  console.log("  4. ls — 列出虚拟文件系统中的文件");
  console.log("  5. 自定义工具 (dictionary, word_counter) 与内置工具无缝协作");
  console.log("  6. StateBackend 提供内存中的虚拟文件系统，无需真实磁盘 IO");
  console.log(`\n最终答案: ${finalAnswer}`);
}
