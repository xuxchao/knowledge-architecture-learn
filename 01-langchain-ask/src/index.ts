import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";

// 加载根目录 .env（子项目统一读取根目录配置）
// 使用 import.meta.url 确保路径相对于脚本文件，而非 process.cwd()
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.error("❌ 缺少环境变量 DASHSCOPE_API_KEY，请在根目录 .env 中配置");
    process.exit(1);
  }

  // 1. 创建 ChatOpenAI 实例，指向阿里千问 DashScope OpenAI 兼容接口
  const model = new ChatOpenAI({
    modelName: process.env.DASHSCOPE_MODEL,
    temperature: 0.7, // 0~1，越高越有创造性
    apiKey,
    configuration: {
      baseURL: process.env.DASHSCOPE_BASE_URL,
    },
  });

  // 2. 硬编码的问题
  const question = "你好";

  // 3. 调用模型获取回答
  const response = await model.invoke(question);

  console.log(`🤖 答：${response.content}`);
}

main().catch((err) => {
  console.error("❌ 运行出错：", err.message);
  process.exit(1);
});
