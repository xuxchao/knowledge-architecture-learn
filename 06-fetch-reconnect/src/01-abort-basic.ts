/**
 * 01-abort-basic.ts — AbortController + fetch 基础用法演示
 *
 * 涵盖：
 * 1. AbortController 基本原理
 * 2. 超时自动中断（setTimeout + abort）
 * 3. 手动中断请求
 * 4. 中断后的错误处理
 */

// ============================================================
// 一、AbortController 是什么？
// ============================================================
// AbortController 是 Web API（Node 18+ 也支持），提供一个 signal 对象，
// 可以传给 fetch、DOM 操作等，实现"一次性"的中断信号。
// signal 只能 abort 一次，不可撤销。abort 后所有监听者都会收到通知。

// ============================================================
// 二、基本用法：手动中断一个请求
// ============================================================

async function demoManualAbort() {
  console.log("\n=== Demo: 手动中断请求 ===");

  const controller = new AbortController();
  const { signal } = controller;

  // 发起一个慢请求（故意用慢 URL 模拟）
  const url = "https://httpstat.us/200?sleep=5000"; // 5 秒后返回 200

  console.log("→ 发起请求，5s 后才返回...");
  const fetchPromise = fetch(url, { signal })
    .then((res) => console.log(`✅ 请求成功: ${res.status}`))
    .catch((err) => {
      if (err.name === "AbortError") {
        console.log("🚫 请求被手动中断了 (AbortError)");
      } else {
        console.log(`❌ 其他错误: ${err.message}`);
      }
    });

  // 1 秒后手动 abort
  setTimeout(() => {
    console.log("→ 1s 后手动调用 controller.abort()");
    controller.abort();
  }, 1000);

  await fetchPromise;
}

// ============================================================
// 三、超时中断：封装 fetchTimeout 工具函数
// ============================================================

/**
 * 带 timeout 的 fetch — 超时自动 abort
 * 生产环境最常见的模式：每个请求都设置超时上限
 */
async function fetchTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 5000
): Promise<Response> {
  const controller = new AbortController();
  const { signal } = controller;

  // 如果外部已经传了 signal，需要合并：外部 abort 或超时 abort 都要生效
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(); // 外部已经 abort 了，立即跟随
    } else {
      // 监听外部 signal，一旦外部 abort，也 abort 内部的
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true, // 只触发一次，避免内存泄漏
      });
    }
  }

  // 超时定时器
  const timer = setTimeout(() => {
    console.log(`⏱️ 超时 ${timeoutMs}ms，自动 abort`);
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal });
    clearTimeout(timer); // 请求成功，清除定时器
    return response;
  } catch (err) {
    clearTimeout(timer); // 请求失败（不管什么原因），清除定时器
    throw err;
  }
}

async function demoTimeoutAbort() {
  console.log("\n=== Demo: 超时自动中断 ===");

  try {
    // 请求需要 5s 才返回，但我们只给 2s 超时
    console.log("→ 发起请求，超时上限 2s（请求本身需要 5s）...");
    await fetchTimeout("https://httpstat.us/200?sleep=5000", {}, 2000);
    console.log("✅ 请求成功（不应该到这里）");
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.log("🚫 因超时被中断 (AbortError)");
    } else {
      console.log(`❌ 其他错误: ${err.message}`);
    }
  }
}

// ============================================================
// 四、abort 事件的监听（signal.addEventListener）
// ============================================================

async function demoAbortEventListener() {
  console.log("\n=== Demo: 监听 abort 事件 ===");

  const controller = new AbortController();
  const { signal } = controller;

  // 可以在 signal 上注册回调，做清理工作
  signal.addEventListener("abort", () => {
    const reason = signal.reason; // abort 原因（可以是任意值）
    console.log(`📢 收到 abort 事件，原因: ${reason || "未指定"}`);
  });

  // abort 时可以传 reason（便于区分中断来源）
  setTimeout(() => {
    controller.abort("用户点击了取消按钮");
  }, 500);

  try {
    await fetch("https://httpstat.us/200?sleep=5000", { signal });
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.log(`🚫 请求中断，reason: ${signal.reason}`);
    }
  }
}

// ============================================================
// 五、多个请求共享同一个 AbortController
// ============================================================

async function demoSharedAbortController() {
  console.log("\n=== Demo: 多请求共享 AbortController ===");

  const controller = new AbortController();
  const { signal } = controller;

  // 同时发起 3 个慢请求，共享同一个 signal
  const urls = [
    "https://httpstat.us/200?sleep=3000",
    "https://httpstat.us/200?sleep=4000",
    "https://httpstat.us/200?sleep=5000",
  ];

  console.log("→ 同时发起 3 个请求...");
  const promises = urls.map((url, i) =>
    fetch(url, { signal })
      .then((res) => console.log(`  ✅ 请求 ${i + 1} 成功: ${res.status}`))
      .catch((err) => {
        if (err.name === "AbortError") {
          console.log(`  🚫 请求 ${i + 1} 被中断`);
        }
      })
  );

  // 1.5s 后统一中断所有请求
  setTimeout(() => {
    console.log("→ 1.5s 后统一中断所有请求");
    controller.abort("批量取消");
  }, 1500);

  await Promise.allSettled(promises);
}

// ============================================================
// 运行所有 demo
// ============================================================

async function main() {
  console.log("📦 AbortController + fetch 基础用法演示\n");

  await demoManualAbort();
  await demoTimeoutAbort();
  await demoAbortEventListener();
  await demoSharedAbortController();

  console.log("\n✅ 所有基础 demo 完成！");
}

main().catch(console.error);
