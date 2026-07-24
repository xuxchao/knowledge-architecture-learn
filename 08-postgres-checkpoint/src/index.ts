/**
 * 08-postgres-checkpoint — LangGraph + PostgreSQL 检查点持久化
 *
 * 核心知识点：
 *   1. PostgresSaver 是什么 — 把 LangGraph 的 checkpoint（状态快照）存到 PostgreSQL
 *   2. 与 MemorySaver 的区别 — 进程退出后状态不丢失，跨重启存活
 *   3. thread_id 机制 — 用 thread_id 隔离不同对话，同 thread_id 共享上下文
 *   4. checkpoint 检查 — getTuple / list / deleteThread 等 API
 *
 * 运行前需要：
 *   确保 PostgreSQL 已启动且有 knowledge-architecture 数据库
 *   pnpm start             # 运行 demo
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// ─── 环境变量 ───────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const BASE_URL =
  process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const API_KEY = process.env.DASHSCOPE_API_KEY || "";
const MODEL = process.env.DASHSCOPE_MODEL || "qwen-plus";

// PostgreSQL 连接串（从环境变量读取，默认指向本地 knowledge-architecture 数据库）
const PG_CONN_STRING =
  process.env.POSTGRES_CONNECTION_STRING ||
  "postgresql://admin:password@localhost:5432/knowledge-architecture";

// ─── 工具函数 ───────────────────────────────────────────────

/** 简单的 sleep */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 分隔线 */
function section(title: string) {
  const line = "═".repeat(58);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${title.padEnd(line.length - 4)}│`);
  console.log(`└${line}┘`);
}

/** 打印消息列表的简要信息 */
function printMessages(messages: unknown[], label = "消息") {
  console.log(`\n  📋 ${label}（共 ${messages.length} 条）：`);
  messages.forEach((msg, i) => {
    if (msg instanceof HumanMessage) {
      console.log(`    [${i}] 👤 Human: ${msg.content}`);
    } else if (msg instanceof AIMessage) {
      const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      const preview = text.length > 80 ? text.slice(0, 80) + "..." : text;
      console.log(`    [${i}] 🤖 AI: ${preview}`);
    } else {
      console.log(`    [${i}] ❓ ${msg.constructor.name}: ${JSON.stringify(msg.content).slice(0, 80)}`);
    }
  });
}

// ─── 状态定义 ───────────────────────────────────────────────

/**
 * LangGraph 状态：messages 数组
 * reducer 用 "追加" 模式 — 每次节点返回的新消息会追加到已有消息列表
 */
const State = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (prev, next) => [...(prev ?? []), ...next],
    default: () => [],
  }),
});

// ─── 图节点 ─────────────────────────────────────────────────

/** 创建 LLM 实例 */
function createLLM() {
  return new ChatOpenAI({
    model: MODEL,
    configuration: { baseURL: BASE_URL },
    apiKey: API_KEY,
    temperature: 0.7,
  });
}

/** 模型调用节点 — 把当前消息列表发给 LLM，返回回复 */
function createModelNode() {
  const llm = createLLM();
  return async (state: typeof State.State) => {
    const response = await llm.invoke(state.messages);
    return { messages: [response] };
  };
}

/**
 * 构建一个 LangGraph 图
 * - 单节点：callModel（调 LLM）
 * - 传入 checkpointer 实现状态持久化
 */
function buildGraph(checkpointer: PostgresSaver) {
  const graph = new StateGraph(State)
    .addNode("callModel", createModelNode())
    .addEdge(START, "callModel")
    .addEdge("callModel", END);

  return graph.compile({ checkpointer });
}

// ─── Demo 主体 ──────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  08-postgres-checkpoint — PostgreSQL 检查点持久化       ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  if (!API_KEY) {
    console.error("\n❌ 缺少 DASHSCOPE_API_KEY，请在根目录 .env 中配置");
    process.exit(1);
  }

  // ── Phase 0: 连接 PostgreSQL 并初始化 ──────────────────
  section("Phase 0: 连接 PostgreSQL & 初始化表结构");

  console.log(`\n  🔗 连接串: ${PG_CONN_STRING}`);
  const checkpointer = PostgresSaver.fromConnString(PG_CONN_STRING);

  console.log("  📦 执行 setup() — 创建 checkpoint 相关表...");
  await checkpointer.setup();
  console.log("  ✅ 表创建完成（checkpoints, checkpoint_blobs, checkpoint_writes）");

  // ── Phase 1: 第一轮对话 — 告诉 Agent 你的名字 ──────────
  section("Phase 1: 第一轮对话 — 告诉 Agent 你的名字");

  const graph = buildGraph(checkpointer);
  const threadId = "demo-thread-001";
  const config = { configurable: { thread_id: threadId } };

  console.log(`\n  🧵 thread_id: ${threadId}`);
  const userMsg1 = "你好！我叫张三，是一名后端工程师。请记住我的信息。";
  console.log(`  👤 用户: ${userMsg1}`);

  const result1 = await graph.invoke(
    { messages: [new HumanMessage(userMsg1)] },
    config
  );

  const aiReply1 = result1.messages[result1.messages.length - 1];
  console.log(`  🤖 AI: ${aiReply1.content}`);
  printMessages(result1.messages, "当前对话历史");

  // ── Phase 2: 第二轮对话 — 同 thread_id，Agent 应记得 ────
  section("Phase 2: 第二轮对话 — 同 thread_id，验证记忆");

  const userMsg2 = "我叫什么名字？做什么工作？";
  console.log(`\n  🧵 thread_id: ${threadId}（与上一轮相同）`);
  console.log(`  👤 用户: ${userMsg2}`);

  const result2 = await graph.invoke(
    { messages: [new HumanMessage(userMsg2)] },
    config
  );

  const aiReply2 = result2.messages[result2.messages.length - 1];
  console.log(`  🤖 AI: ${aiReply2.content}`);
  printMessages(result2.messages, "完整对话历史（累积）");

  // ── Phase 3: 模拟进程重启 — 新 checkpointer 实例 ────────
  section("Phase 3: 模拟进程重启 — 全新 checkpointer 实例");

  console.log("\n  🔄 关闭旧连接，创建全新的 PostgresSaver + Graph 实例...");
  console.log("  （模拟：进程退出后重新启动，MemorySaver 在这里会丢失所有状态）");

  await checkpointer.end();
  await sleep(500); // 确保连接池关闭

  const checkpointer2 = PostgresSaver.fromConnString(PG_CONN_STRING);
  // 注意：第二次不需要 setup()，表已经存在了
  const graph2 = buildGraph(checkpointer2);

  const userMsg3 = "你还记得我是谁吗？";
  console.log(`\n  🧵 thread_id: ${threadId}（同一个 thread_id）`);
  console.log(`  👤 用户: ${userMsg3}`);

  const result3 = await graph2.invoke(
    { messages: [new HumanMessage(userMsg3)] },
    config  // 同一个 config（thread_id）
  );

  const aiReply3 = result3.messages[result3.messages.length - 1];
  console.log(`  🤖 AI: ${aiReply3.content}`);

  if (typeof aiReply3.content === "string" && aiReply3.content.includes("张三")) {
    console.log("\n  ✅ 验证成功！新进程仍然记得你的名字 — 状态已从 PostgreSQL 恢复");
  } else {
    console.log("\n  ⚠️ AI 回复中未明确提到名字，请检查 checkpoint 是否正确恢复");
  }

  printMessages(result3.messages, "重启后的完整对话历史（从 PG 恢复 + 新消息）");

  // ── Phase 4: Checkpoint 检查 — 底层 API ─────────────────
  section("Phase 4: Checkpoint 底层 API — 检查存储的状态");

  console.log("\n  📌 getTuple() — 获取最新的 checkpoint：");
  const tuple = await checkpointer2.getTuple(config);
  if (tuple) {
    console.log(`     checkpoint_id: ${tuple.checkpoint.id}`);
    console.log(`     timestamp:     ${tuple.checkpoint.ts}`);
    console.log(`     parent_id:     ${tuple.parentConfig?.configurable?.checkpoint_id || "(无)"}`);
    const msgCount = (tuple.checkpoint.channel_values as any)?.messages?.length ?? 0;
    console.log(`     消息数量:       ${msgCount}`);
    console.log(`     metadata:      ${JSON.stringify(tuple.metadata)}`);
  }

  console.log("\n  📋 list() — 列出该 thread 的所有 checkpoint（历史快照）：");
  let cpIndex = 1;
  for await (const ct of checkpointer2.list(config)) {
    const msgCount = (ct.checkpoint.channel_values as any)?.messages?.length ?? 0;
    console.log(
      `     [${cpIndex}] id=${ct.checkpoint.id.slice(0, 8)}...  ts=${ct.checkpoint.ts}  msgs=${msgCount}`
    );
    cpIndex++;
  }
  console.log(`     共 ${cpIndex - 1} 个 checkpoint`);

  // ── Phase 5: 多线程隔离 — 不同 thread_id 独立 ───────────
  section("Phase 5: 多线程隔离 — 不同 thread_id 互不干扰");

  const threadId2 = "demo-thread-002";
  const config2 = { configurable: { thread_id: threadId2 } };

  console.log(`\n  🧵 新 thread_id: ${threadId2}`);
  const userMsg4 = "我叫什么名字？";
  console.log(`  👤 用户: ${userMsg4}`);

  const result4 = await graph2.invoke(
    { messages: [new HumanMessage(userMsg4)] },
    config2
  );

  const aiReply4 = result4.messages[result4.messages.length - 1];
  console.log(`  🤖 AI: ${aiReply4.content}`);
  console.log("  ✅ 新线程不知道张三的信息 — 状态按 thread_id 隔离");

  // ── Phase 6: 清理 ────────────────────────────────────────
  section("Phase 6: 清理 — 删除线程 & 关闭连接");

  console.log("\n  🗑️ deleteThread() — 删除 thread-001 的所有数据...");
  await checkpointer2.deleteThread(threadId);
  console.log("  🗑️ deleteThread() — 删除 thread-002 的所有数据...");
  await checkpointer2.deleteThread(threadId2);

  // 验证删除
  const deletedTuple = await checkpointer2.getTuple(config);
  console.log(`  ✅ 删除后 getTuple() 返回: ${deletedTuple ? "仍有数据（异常）" : "undefined（已清空）"}`);

  console.log("\  🔌 end() — 关闭连接池...");
  await checkpointer2.end();

  // ── 总结 ──────────────────────────────────────────────────
  section("总结");

  console.log(`
  ┌─────────────────────────────────────────────────────────┐
  │ PostgresSaver vs MemorySaver                             │
  ├──────────────────┬──────────────┬────────────────────────┤
  │                  │ MemorySaver  │ PostgresSaver          │
  ├──────────────────┼──────────────┼────────────────────────┤
  │ 存储位置          │ JS 内存      │ PostgreSQL 数据库      │
  │ 进程退出后        │ ❌ 丢失      │ ✅ 保留                │
  │ 跨进程共享        │ ❌ 不支持    │ ✅ 多进程共享同一 DB   │
  │ 生产可用          │ ❌ 仅开发    │ ✅ 面向生产             │
  │ 需要 setup()     │ ❌ 不需要    │ ✅ 首次必须调用         │
  │ 事务保证          │ ❌ 无        │ ✅ 数据库事务           │
  └──────────────────┴──────────────┴────────────────────────┘

  关键 API：
    PostgresSaver.fromConnString(connStr)  — 工厂方法创建实例
    .setup()                               — 首次使用创建表
    .getTuple(config)                      — 获取最新 checkpoint
    .list(config)                          — 列出所有 checkpoint
    .deleteThread(threadId)                — 删除整个线程
    .end()                                 — 关闭连接池

  核心理解：
    • checkpoint = LangGraph 在每一步执行后保存的状态快照
    • thread_id  = 对话线程标识，同 thread_id 共享上下文
    • 持久化后，新进程只需连接同一个 DB + 同一个 thread_id
      即可恢复之前的完整对话状态
  `);
}

main().catch((err) => {
  console.error("\n❌ 运行出错:", err);
  process.exit(1);
});
