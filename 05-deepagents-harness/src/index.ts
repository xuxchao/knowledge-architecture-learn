/**
 * 05-deepagents-harness — DeepAgents 库实现 Harness 架构
 *
 * 本项目展示 LangChain DeepAgents 库如何"开箱即用"地提供 Harness 架构：
 *   - 实验一：同 04 项目的 3 工具 + 同任务，对比展示
 *   - 实验二：规划能力 (write_todos)
 *   - 实验三：文件系统操作 (write_file/read_file/edit_file/ls/grep)
 *   - 实验四：子代理委派 (task)
 *
 * 运行方式：
 *   npx tsx src/index.ts        — 运行所有实验
 *   npx tsx src/index.ts 1      — 只运行实验1
 *   npx tsx src/index.ts 2      — 只运行实验2
 *   ...
 */

import { experiment1 } from "./experiment1.js";
import { experiment2 } from "./experiment2.js";
import { experiment3 } from "./experiment3.js";
import { experiment4 } from "./experiment4.js";

async function main() {
  const arg = process.argv[2]; // 可选：运行指定实验

  console.log("\n============================================================");
  console.log("  05-deepagents-harness — DeepAgents 实现 Harness 架构");
  console.log("============================================================");
  console.log("\n  DeepAgents = batteries-included agent harness");
  console.log("  内置：ReAct循环 / 规划(write_todos) / 文件系统 / 子代理委派");
  console.log("  对比 04 手动 Harness，展示开箱即用的差异\n");

  // if (arg === "1" || !arg) {
  //   await experiment1();
  //   if (!arg) await sleep(2000);
  // }
  // if (arg === "2" || !arg) {
  //   await experiment2();
  //   if (!arg) await sleep(2000);
  // }
  // if (arg === "3" || !arg) {
  //   await experiment3();
  //   if (!arg) await sleep(2000);
  // }
  if (arg === "4" || !arg) {
    await experiment4();
  }

  console.log("\n============================================================");
  console.log("  全部实验完成");
  console.log("============================================================\n");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("运行出错：", err.message);
  process.exit(1);
});
