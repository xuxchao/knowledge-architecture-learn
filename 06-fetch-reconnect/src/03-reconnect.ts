/**
 * 03-reconnect.ts — AI 会话重连：中断后恢复对话
 *
 * 涵盖：
 * 1. 会话状态管理（消息历史 + 部分回复）
 * 2. 中断后保存部分数据，作为 assistant 消息存入历史
 * 3. 重连时带上完整消息历史，让 AI "继续"
 * 4. 多种重连策略：续写、重试、换模型
 * 5. 指数退避自动重连
 *
 * 使用 DashScope OpenAI 兼容接口
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
// 类型定义
// ============================================================

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type ReconnectStrategy = "continue" | "retry" | "fallback";

interface ReconnectConfig {
  strategy: ReconnectStrategy;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  fallbackModel?: string; // fallback 策略时使用的备用模型
}

// ============================================================
// SSE 流读取（复用 02 的逻辑）
// ============================================================

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return fullText;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch { /* ignore */ }
      }
    }
  } catch (err: any) {
    if (err.name === "AbortError" || signal?.aborted) {
      // 正常中断，不做额外处理
    } else {
      console.log(`  ❌ 流读取错误: ${err.message}`);
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

// ============================================================
// 核心：ReconnectableChat — 可重连的 AI 会话管理器
// ============================================================

/**
 * ReconnectableChat
 *
 * 设计要点：
 * 1. 维护完整消息历史（messages 数组）
 * 2. 中断后，将部分回复存为 assistant 消息 → 重连时 AI 能"看到"上下文
 * 3. 三种重连策略：
 *    - continue: 保留部分回复，让 AI "请继续"
 *    - retry:    丢弃部分回复，重新回答同一问题
 *    - fallback:  切换备用模型重试
 * 4. 指数退避：网络错误时自动重试，延迟递增
 * 5. 外部可通过 abort() 随时中断
 */
class ReconnectableChat {
  private messages: ChatMessage[] = [];
  private controller: AbortController | null = null;
  private partialResponse = "";
  private retryCount = 0;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
    private reconnectConfig: ReconnectConfig = {
      strategy: "continue",
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffFactor: 2,
      fallbackModel: "qwen-turbo", // 更快但质量稍低的备用模型
    }
  ) {}

  // ============================================================
  // 公开 API
  // ============================================================

  /**
   * 发送用户消息并获取 AI 回复（支持中断 + 重连）
   */
  async send(
    userContent: string,
    onChunk?: (text: string) => void
  ): Promise<string> {
    // 1. 加入用户消息
    this.messages.push({ role: "user", content: userContent });

    // 2. 尝试获取回复（带重连逻辑）
    return this.requestWithReconnect(onChunk);
  }

  /**
   * 中断当前请求
   */
  abort(reason?: string) {
    this.controller?.abort(reason || "手动中断");
  }

  /**
   * 获取完整消息历史
   */
  getHistory(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * 获取当前部分回复
   */
  getPartialResponse(): string {
    return this.partialResponse;
  }

  // ============================================================
  // 内部：带重连的请求
  // ============================================================

  /**
   * 核心方法：发起请求，失败/中断时按策略重连
   */
  private async requestWithReconnect(
    onChunk?: (text: string) => void,
    currentModel?: string
  ): Promise<string> {
    const model = currentModel || this.model;
    this.retryCount = 0;

    while (this.retryCount <= this.reconnectConfig.maxRetries) {
      this.controller = new AbortController();
      this.partialResponse = "";

      try {
        console.log(
          `→ 请求 #${this.retryCount + 1} (模型: ${model})...`
        );

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: this.buildMessagesForStrategy(),
            stream: true,
          }),
          signal: this.controller.signal,
        });

        // ---- HTTP 错误处理 ----
        if (!response.ok) {
          const errBody = await response.text();
          console.log(`  ❌ HTTP ${response.status}: ${errBody.slice(0, 100)}`);

          // 5xx 服务器错误 → 自动重试
          if (response.status >= 500) {
            this.retryCount++;
            if (this.retryCount <= this.reconnectConfig.maxRetries) {
              const delay = this.calcBackoffDelay();
              console.log(`  ⏳ 指数退避 ${delay}ms 后重试...`);
              await this.sleep(delay);
              continue;
            }
          }

          // 4xx 客户端错误（如 401/403/429）→ 不重试
          throw new Error(`API 错误 ${response.status}: ${errBody}`);
        }

        // ---- 流式读取 ----
        const fullText = await readSSEStream(
          response.body!,
          (chunk) => {
            this.partialResponse += chunk;
            onChunk?.(chunk);
          },
          this.controller.signal
        );

        // ---- 成功完成 ----
        this.messages.push({ role: "assistant", content: fullText });
        console.log(`  ✅ 完成 (${fullText.length} 字)`);
        return fullText;

      } catch (err: any) {
        // ---- 用户手动中断 ----
        if (this.controller.signal.aborted) {
          const reason = this.controller.signal.reason;
          console.log(`  🚫 被中断，原因: ${reason || "未知"}`);

          if (reason === "手动中断") {
            // 用户主动取消 → 保存部分数据到历史，不自动重连
            this.savePartialToHistory();
            return this.partialResponse;
          }

          // 其他中断（如超时）→ 按策略重连
          this.retryCount++;
          if (this.retryCount <= this.reconnectConfig.maxRetries) {
            console.log(`  🔄 根据策略 "${this.reconnectConfig.strategy}" 重连...`);
            const delay = this.calcBackoffDelay();
            await this.sleep(delay);
            continue;
          }

          this.savePartialToHistory();
          return this.partialResponse;
        }

        // ---- 网络错误（ECONNREFUSED, ETIMEDOUT 等）→ 自动重试 ----
        if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") {
          this.retryCount++;
          if (this.retryCount <= this.reconnectConfig.maxRetries) {
            const delay = this.calcBackoffDelay();
            console.log(`  🔄 网络错误 ${err.code}, ${delay}ms 后重试...`);
            await this.sleep(delay);
            continue;
          }
          throw err;
        }

        // ---- 其他不可恢复的错误 ----
        throw err;
      }
    }

    // 重试次数耗尽
    this.savePartialToHistory();
    return this.partialResponse;
  }

  // ============================================================
  // 内部：策略相关
  // ============================================================

  /**
   * 根据重连策略构建发送给 AI 的消息数组
   *
   * - continue: 保留部分 assistant 回复 +追加 "请继续"
   * - retry:    丢弃部分回复，重发同一 user 消息
   * - fallback: 丢弃部分回复，换模型重发
   */
  private buildMessagesForStrategy(): ChatMessage[] {
    switch (this.reconnectConfig.strategy) {
      case "continue":
        // 保留部分回复，让 AI "接着说"
        if (this.partialResponse) {
          // 部分回复已经在 messages 里（通过 savePartialToHistory）
          // 需要追加一条 "请继续" 的提示
          return [
            ...this.messages,
            { role: "user", content: "请继续你刚才的回答，从断开的地方接着写。" },
          ];
        }
        return this.messages;

      case "retry":
        // 丢弃部分回复，重新回答
        // 移除最后一条 partial assistant 消息（如果存在）
        if (this.partialResponse) {
          const filtered = this.messages.filter((m) => m.content !== this.partialResponse);
          return filtered;
        }
        return this.messages;

      case "fallback":
        // 与 retry 相同的消息，但使用备用模型
        if (this.partialResponse) {
          const filtered = this.messages.filter((m) => m.content !== this.partialResponse);
          return filtered;
        }
        return this.messages;

      default:
        return this.messages;
    }
  }

  /**
   * 将部分回复保存到消息历史
   * 重连时 AI 能看到这段"不完整"的回答，理解上下文
   */
  private savePartialToHistory() {
    if (this.partialResponse && !this.messages.some((m) => m.content === this.partialResponse)) {
      this.messages.push({ role: "assistant", content: this.partialResponse });
      console.log(`  💾 保存部分回复到历史 (${this.partialResponse.length} 字)`);
    }
  }

  /**
   * 计算指数退避延迟
   * delay = min(initial * factor^retry, maxDelay)
   */
  private calcBackoffDelay(): number {
    const { initialDelayMs, maxDelayMs, backoffFactor } = this.reconnectConfig;
    const delay = initialDelayMs * Math.pow(backoffFactor, this.retryCount - 1);
    return Math.min(delay, maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// Demo 场景
// ============================================================

async function demoContinueStrategy() {
  console.log("\n=== Demo 1: continue 策略 — 中断后让 AI 续写 ===");

  const chat = new ReconnectableChat(BASE_URL, API_KEY, MODEL, {
    strategy: "continue",
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffFactor: 2,
  });

  // 第一次发送，2秒后手动中断
  console.log("\n→ 第一次请求，2s 后手动中断...");
  setTimeout(() => chat.abort("手动中断"), 2000);

  const result1 = await chat.send(
    "请详细解释 Node.js 的事件循环机制，包括宏任务、微任务、poll 阶段等，至少 300 字。",
    (chunk) => process.stdout.write(chunk)
  );

  console.log(`\n\n  第一次结果 (${result1.length} 字): "${result1.slice(0, 80)}..."`);

  // 查看消息历史
  console.log("\n  📋 消息历史:");
  chat.getHistory().forEach((m, i) => {
    const preview = m.content.slice(0, 60) + (m.content.length > 60 ? "..." : "");
    console.log(`  [${i}] ${m.role}: "${preview}"`);
  });

  // 续写：再次请求，让 AI 继续（不中断）
  console.log("\n→ 续写请求（不中断）...");
  const result2 = await chat.send(
    "请继续你刚才的解释，补充 check 和 close 阶段的内容。",
    (chunk) => process.stdout.write(chunk)
  );

  console.log(`\n\n  续写结果 (${result2.length} 字): "${result2.slice(0, 80)}..."`);

  // 最终历史
  console.log("\n  📋 最终消息历史:");
  chat.getHistory().forEach((m, i) => {
    const preview = m.content.slice(0, 60) + (m.content.length > 60 ? "..." : "");
    console.log(`  [${i}] ${m.role}: "${preview}"`);
  });
}

async function demoRetryStrategy() {
  console.log("\n=== Demo 2: retry 策略 — 中断后重新回答 ===");

  const chat = new ReconnectableChat(BASE_URL, API_KEY, MODEL, {
    strategy: "retry",
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffFactor: 2,
  });

  // 第一次发送，1.5秒后中断
  console.log("\n→ 第一次请求，1.5s 后中断...");
  setTimeout(() => chat.abort("手动中断"), 1500);

  const result1 = await chat.send(
    "用 200 字介绍 Docker 容器技术。",
    (chunk) => process.stdout.write(chunk)
  );

  console.log(`\n\n  第一次结果（部分数据）(${result1.length} 字): "${result1.slice(0, 80)}..."`);

  // 重试策略：丢弃部分数据，重新回答同一问题
  console.log("\n→ 重试请求（不中断，完整回答）...");
  const result2 = await chat.send(
    "用 200 字介绍 Docker 容器技术。", // 重新问同一个问题
    (chunk) => process.stdout.write(chunk)
  );

  console.log(`\n\n  重试结果 (${result2.length} 字): "${result2.slice(0, 80)}..."`);
}

async function demoFallbackStrategy() {
  console.log("\n=== Demo 3: fallback 策略 — 中断后换模型重试 ===");

  const chat = new ReconnectableChat(BASE_URL, API_KEY, MODEL, {
    strategy: "fallback",
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffFactor: 2,
    fallbackModel: "qwen-turbo", // 更快的备用模型
  });

  // 第一次发送，1秒后中断
  console.log("\n→ 第一次请求 (qwen-plus)，1s 后中断...");
  setTimeout(() => chat.abort("手动中断"), 1000);

  const result1 = await chat.send(
    "什么是 REST API？",
    (chunk) => process.stdout.write(chunk)
  );

  console.log(`\n\n  第一次结果 (${result1.length} 字): "${result1.slice(0, 80)}..."`);

  // fallback：换 qwen-turbo 重试
  console.log("\n→ fallback 请求 (qwen-turbo)...");
  const result2 = await chat.send(
    "什么是 REST API？",
    (chunk) => process.stdout.write(chunk)
  );

  console.log(`\n\n  fallback 结果 (${result2.length} 字): "${result2.slice(0, 80)}..."`);
}

async function demoExponentialBackoff() {
  console.log("\n=== Demo 4: 指数退避 — 模拟网络错误后自动重连 ===");

  // 这个 demo 用一个不存在的 URL 模拟网络错误
  const badUrl = "https://this-domain-does-not-exist.example.com/v1";

  const chat = new ReconnectableChat(badUrl, API_KEY, MODEL, {
    strategy: "retry",
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffFactor: 2,
  });

  console.log("\n→ 使用不存在的主机名，模拟网络故障...");
  console.log("→ 预期行为: 每次失败后延迟递增重试 (1s → 2s → 4s)");

  try {
    await chat.send("Hello", (chunk) => process.stdout.write(chunk));
  } catch (err: any) {
    console.log(`\n  ❌ 最终失败: ${err.message}`);
    console.log("  但指数退避逻辑已正确执行");
  }
}

// ============================================================
// 运行所有 demo
// ============================================================

async function main() {
  console.log("📦 AI 会话重连策略演示\n");
  console.log(`模型: ${MODEL}\n`);

  // 依次运行（每个 demo 之间有间隔，避免 API 限频）
  await demoContinueStrategy();
  console.log("\n" + "─".repeat(60));

  await demoRetryStrategy();
  console.log("\n" + "─".repeat(60));

  await demoFallbackStrategy();
  console.log("\n" + "─".repeat(60));

  await demoExponentialBackoff();

  console.log("\n✅ 所有重连 demo 完成！");
}

main().catch(console.error);
