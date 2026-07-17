# 知识架构 — AI 知识库知识点渐进式学习

## 项目定位

本项目用 **N 多个例子** 来渐进式搭建 AI 知识库需要用到的知识点。
每个例子是一个**独立的 Node 项目**，聚焦一个具体知识点，逐步递进、由浅入深。

## 目录结构约定

```
knowledge-architecture/
├── 01-xxx/          # 第 1 个例子（Node 项目）
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
├── 02-xxx/          # 第 2 个例子（Node 项目）
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
├── ...
├── .env             # 根目录环境变量（统一管理 API Key 等）
├── .env.example     # 环境变量模板（可提交到 Git）
├── GUIDE.md         # 本引导文件（项目上下文说明）
└── .workbuddy/
    └── memory/      # 项目记忆（跨会话持久化）
```

## 核心规则

1. **独立 Node 项目** — 每个例子拥有自己的 `package.json`、依赖和代码，互不耦合。
2. **编号递进** — 目录以两位数字编号开头（`01-`, `02-`, …），体现学习顺序。
3. **单点聚焦** — 一个例子只讲一个知识点，保持最小可运行状态。
4. **可运行验证** — 每个例子应能通过 `npx tsx src/index.ts` 直接运行并观察结果，无需先编译再运行。
5. **渐进积累** — 后续例子可以引用前面例子的概念，但代码层面保持独立。

## 知识点覆盖范围（AI 知识库相关）

- 文本处理与分词
- 向量化与嵌入（Embedding）
- 向量存储与检索
- 语义搜索与相似度计算
- 知识分块（Chunking）策略
- 元数据与索引设计
- RAG（检索增强生成）基础
- Prompt 模板与上下文组装
- 多轮对话与记忆管理
- 知识图谱基础
- …持续扩展

## 环境变量管理

所有子项目统一读取**根目录**的 `.env` 文件，方便集中管理 API Key 等配置。

- `.env` 文件位于项目根目录（`knowledge-architecture/.env`）
- 子项目通过 `dotenv` 加载根 `.env`，需用 `import.meta.url` 解析路径（因为 `dotenv.config` 的路径相对于 `process.cwd()`，而非脚本文件）：`dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') })`
- `.env` 不提交到 Git（已在 `.gitignore` 中排除）
- 提供模板文件 `.env.example` 供参考

## 开发约定

- **语言**：优先使用 **TypeScript**（`.ts`）编写代码，不使用纯 JavaScript
- **运行方式**：使用 **tsx** 直接运行 TypeScript，无需先编译为 JS 再执行，追求最快启动速度
- **运行命令**：`npx tsx src/index.ts`（tsx 基于 esbuild，启动极快）
- **运行时**：Node.js（使用 workbuddy managed 版本 `C:\Users\64535\.workbuddy\binaries\node\versions\22.22.2\node.exe`）
- **包管理**：使用 **pnpm** 安装依赖，每个例子独立安装，依赖隔离
- **依赖分类**：`@types/node`、`typescript`、`tsx` 等类型/工具包必须放在 **devDependencies**，业务依赖放 dependencies
- **TS 配置**：每个子项目的 `tsconfig.json` 必须包含 `"types": ["node"]`，确保 `process` 等 Node 全局变量有类型定义
- **入口文件**：`src/index.ts`（可自定义，但 `package.json` 中应声明 `main`）
- **环境变量**：子项目通过 dotenv 读取根目录 `.env`，不在子项目内单独设置

## 如何新增例子

创建新目录，编号递增：

```
mkdir NN-topic-name
cd NN-topic-name
pnpm init
pnpm add -D tsx typescript @types/node
# 根据需要添加业务依赖，如：
pnpm add dotenv
# 编写 src/index.ts
npx tsx src/index.ts   # 直接运行
```

子项目 `tsconfig.json` 必须包含 `"types": ["node"]`。

命名规则：`NN-简短英文描述`，如 `03-chunking-strategy`、`07-rag-basics`。
