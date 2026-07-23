/**
 * index.ts — 入口文件，汇总运行所有 demo
 *
 * 可以单独运行每个 demo：
 *   pnpm demo:basic    — AbortController 基础用法
 *   pnpm demo:stream   — AI 流式中断 + 部分数据回收
 *   pnpm demo:reconnect — 重连策略演示
 *
 * 或直接 pnpm start 运行全部
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const BASE_URL = process.env.DASHSCOPE_BASE_URL || "";
const API_KEY = process.env.DASHSCOPE_API_KEY || "";
const MODEL = process.env.DASHSCOPE_MODEL || "qwen-plus";

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║   06-fetch-reconnect — fetch + AbortController 重连     ║");
console.log("╚══════════════════════════════════════════════════════════╝");

console.log("\n本项目包含 3 个独立 demo：");
console.log("  1. 01-abort-basic.ts    — AbortController + fetch 基础用法");
console.log("  2. 02-stream-abort.ts   — AI 流式会话中断 + 部分数据回收");
console.log("  3. 03-reconnect.ts      — AI 会话重连策略（续写/重试/fallback + 退避）");
console.log("\n运行方式：");
console.log("  pnpm demo:basic     — 只跑基础 demo（无需 API Key）");
console.log("  pnpm demo:stream    — 只跑流式中断 demo（需要 API Key）");
console.log("  pnpm demo:reconnect — 只跑重连 demo（需要 API Key）");
console.log("  pnpm start          — 运行全部");

if (API_KEY) {
  console.log(`\n✅ API Key 已配置，模型: ${MODEL}`);
} else {
  console.log("\n⚠️  未配置 DASHSCOPE_API_KEY，demo 2/3 需要 API Key 才能运行");
  console.log("   请在根目录 .env 中设置 DASHSCOPE_API_KEY");
}

console.log("\n请使用对应的 pnpm 命令运行各个 demo。");
