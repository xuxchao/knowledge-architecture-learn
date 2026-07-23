/**
 * 02-stream-abort.ts — AI 流式会话的中断与部分数据回收
 *
 * 涵盖：
 * 1. 流式 SSE 请求的基本中断
 * 2. 中断后回收已接收的部分数据
 * 3. 用 AbortController 实现"取消当前回复"按钮
 *
 * 使用 DashScope OpenAI 兼容接口（/chat/completions, stream=true）
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// ============================================================
// 配置
// ============================================================

const BASE_URL = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const API_KEY = process.env.DASHSCOPE_API_KEY || "";
const MODEL = process.env.DASHSCOPE_MODEL || "qwen-plus";

if (!API_KEY) {
  console.error("❌ 请在根目录 .env 中设置 DASHSCOPE_API_KEY");
  process.exit(1);
}

// ============================================================
// 消息类型
// ============================================================

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ============================================================
// 一、流式 SSE 解析工具
// ============================================================

/**
 * 从 ReadableStream 中逐行读取 SSE 数据
 * SSE 格式: data: {...}\n\n  或  data: [DONE]\n\n
 */
async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = ""; // 未处理的数据缓冲区
  let fullText = ""; // 收到的全部文本

  try {
    while (true) {
      // 如果 signal 已 abort，提前退出
      if (signal?.aborted) {
        console.log("  📢 检测到 signal abort，停止读取流");
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按换行拆分，提取 SSE 事件
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // 最后一行可能不完整，留在 buffer 里

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();

        if (data === "[DONE]") {
          console.log("  🏁 流结束标记 [DONE]");
          return fullText;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {
          // 非 JSON 行忽略
        }
      }
    }
  } catch (err: any) {
    if (err.name === "AbortError" || signal?.aborted) {
      console.log("  🚫 流读取被中断");
    } else {
      console.log(`  ❌ 流读取错误: ${err.message}`);
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

// ============================================================
// 二、Demo: 正常流式请求（不中断）
// ============================================================

async function demoNormalStream() {
  console.log("\n=== Demo: 正常流式请求 ===");

  const messages: ChatMessage[] = [
    { role: "user", content: "用一句话介绍 TypeScript" },
  ];

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, stream: true }),
  });

  if (!response.ok) {
    console.log(`❌ 请求失败: ${response.status}`);
    return;
  }

  const fullText = await readSSEStream(response.body!, (chunk) => {
    process.stdout.write(chunk); // 实时输出
  });

  console.log(`\n  📝 完整回复 (${fullText.length} 字): ${fullText.slice(0, 50)}...`);
}

// ============================================================
// 三、Demo: 流式请求中断 + 回收部分数据
// ============================================================

async function demoStreamAbort() {
  console.log("\n=== Demo: 流式请求中断 + 回收部分数据 ===");

  const controller = new AbortController();
  const { signal } = controller;

  const messages: ChatMessage[] = [
    { role: "user", content: "详细解释 JavaScript 的闭包概念，包括定义、原理、常见应用场景和注意事项" },
  ];

  console.log("→ 发起流式请求，要求 AI 写长回复...");
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, stream: true }),
    signal, // ← 关键：传 signal 给 fetch
  });

  if (!response.ok) {
    console.log(`❌ 请求失败: ${response.status}`);
    return;
  }

  // 2 秒后中断流（模拟用户点击"停止生成"）
  setTimeout(() => {
    console.log("\n→ ⏱️ 2s 后手动中断流...");
    controller.abort("用户点击停止");
  }, 2000);

  // 中断后仍然能回收已接收的部分数据！
  const partialText = await readSSEStream(response.body!, (chunk) => {
    process.stdout.write(chunk);
  }, signal);

  console.log(`\n  📝 中断后回收的部分数据 (${partialText.length} 字):`);
  console.log(`  "${partialText}"`);
}

// ============================================================
// 四、封装：带 abort 能力的流式 AI 客户端
// ============================================================

/**
 * StreamChatClient — 一个可以随时中断的流式 AI 会话客户端
 *
 * 核心设计：
 * - 内部持有 AbortController，可以随时 abort()
 * - 中断后保存部分数据，支持重连时复用
 * - 提供 onChunk 回调实时输出
 */
class StreamChatClient {
  private controller: AbortController | null = null;
  private partialResponse = ""; // 当前回合已收到的部分回复

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string
  ) {}

  /**
   * 发起流式请求，返回完整回复
   * 可通过 abort() 方法随时中断
   */
  async chat(
    messages: ChatMessage[],
    onChunk?: (text: string) => void
  ): Promise<string> {
    // 每次新请求都创建新的 controller
    this.controller = new AbortController();
    this.partialResponse = "";

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, messages, stream: true }),
        signal: this.controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`API 错误 ${response.status}: ${errBody}`);
      }

      this.partialResponse = await readSSEStream(
        response.body!,
        (chunk) => {
          this.partialResponse += chunk; // 同时更新 partialResponse
          onChunk?.(chunk);
        },
        this.controller.signal
      );

      return this.partialResponse;
    } catch (err: any) {
      if (err.name === "AbortError" || this.controller.signal.aborted) {
        // 中断不是错误，返回已收到的部分数据
        return this.partialResponse;
      }
      throw err;
    }
  }

  /**
   * 中断当前流式请求
   */
  abort(reason?: string) {
    this.controller?.abort(reason || "手动中断");
  }

  /**
   * 获取已收到的部分回复（中断后依然可用）
   */
  getPartialResponse(): string {
    return this.partialResponse;
  }

  /**
   * 当前请求是否已被中断
   */
  isAborted(): boolean {
    return this.controller?.signal.aborted ?? false;
  }
}

async function demoStreamChatClient() {
  console.log("\n=== Demo: StreamChatClient 封装 ===");

  const client = new StreamChatClient(BASE_URL, API_KEY, MODEL);

  const messages: ChatMessage[] = [
    { role: "user", content: "用 200 字解释什么是微服务架构" },
  ];

  // 1.5 秒后中断
  setTimeout(() => {
    console.log("\n→ ⏱️ 1.5s 后调用 client.abort()");
    client.abort("用户取消");
  }, 1500);

  const result = await client.chat(messages, (chunk) => {
    process.stdout.write(chunk);
  });

  console.log(`\n  结果 (${result.length} 字): "${result}"`);
  console.log(`  是否被中断: ${client.isAborted()}`);
  console.log(`  部分数据与结果一致: ${client.getPartialResponse() === result}`);
}

// ============================================================
// 运行所有 demo
// ============================================================

async function main() {
  console.log("📦 AI 流式会话的中断与部分数据回收演示\n");
  console.log(`模型: ${MODEL}\n`);

  await demoNormalStream();
  await demoStreamAbort();
  await demoStreamChatClient();

  console.log("\n✅ 所有流式中断 demo 完成！");
}

main().catch(console.error);
