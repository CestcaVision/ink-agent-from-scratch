# 阶段 03：AI SDK 单次调用与流式输出

[返回学习目录](../README.md) · [上一阶段](02-terminal-input.md)

状态：已完成并提交为 `52f58d7`（`finished: step03`）。你已确认使用 DeepSeek API 跑通；已提交代码使用 `createAnthropic` 作为协议适配器。后续保留你已验证的配置。下文保留最初的操作说明，实际服务选择以此记录为准。

## 目标与起点

你已提交 `8a43fe3`（`finished: step02`）。目前程序可以连续读取一行文字，再把它回显到终端。

这一阶段把回显替换为模型回答：先完成一次独立请求，再把流式响应接回输入循环。每轮只发送本轮文字，对话记忆留到阶段 04。

当前代码还没有空行过滤和 `/exit`，下面的最终入口会一并补上。

本阶段先沿用原教程的 Anthropic Messages API。需要你自己的 API Key 和账户可用的模型 ID。若你准备使用 OpenAI 或其他协议的服务，先告诉助手服务名称，调整 provider 后再安装；只更换网址不能让不同 API 协议相互兼容。

## 文件与职责

| 文件 | 本阶段的作用 |
|---|---|
| `package.json`、`pnpm-lock.yaml` | 安装并记录 AI SDK 依赖 |
| `.env.example` | 可提交的配置模板，密钥为空 |
| `.env` | 你本地填写的模型配置；已被 .gitignore 忽略 |
| `src/model.ts` | 读取配置，创建模型对象 |
| `src/ask.ts` | 独立验证一次模型调用 |
| `src/main.ts` | 用户输入循环、流式输出和退出 |
| `stages/03-model-streaming.md` | 记录学习目标和实际验证结果 |

所有命令在 `ink-agent-from-scratch/` 根目录执行。

## 第一次提交：保存说明

```bash
git status --short
git add README.md stages/02-terminal-input.md stages/03-model-streaming.md
git diff --cached
```

确认是本阶段的文档改动后提交：

```bash
git commit -m "plan: step03 model streaming"
```

## 第一步：安装依赖

```bash
pnpm add -E ai@6.0.279 @ai-sdk/anthropic@3.0.116 dotenv@17.2.3 zod@4.1.12
```

这里固定使用与参考项目兼容的 AI SDK 6，而不是跟随最新主版本。`-E` 将精确版本写进 package.json，锁文件记录完整依赖树。

- `ai`：提供 `generateText`、`streamText` 等统一模型调用接口。
- `@ai-sdk/anthropic`：把统一接口适配到 Anthropic。
- `dotenv`：读取 `.env`，将配置加载到 `process.env`。
- `zod`：满足 AI SDK 的 peer dependency；后面的工具参数校验也会用到，本阶段暂不编写 schema。

这次使用普通 dependencies；阶段 01 的 tsx、TypeScript 仍保留在 devDependencies。

若再次出现 `ERR_PNPM_IGNORED_BUILDS`，检查提示的具体包名。如果仍是之前的 esbuild，按已经学过的方式批准它并重新安装；已有的 pnpm-workspace.yaml 保留。

## 第二步：准备模型配置

新建 `.env.example`，内容为：

```dotenv
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
# 使用官方服务时不需要设置 BASE_URL。
# 只有使用 Anthropic 协议兼容服务时，才按服务文档填写 API 基础地址。
# ANTHROPIC_BASE_URL=
```

复制一份本地配置：

```bash
cp .env.example .env
```

如果已有 `.env`，直接编辑它，不要用复制命令覆盖已有配置。

在 `.env` 中填入真实密钥和完整模型 ID。模板中不写死模型名，因为你账户可使用的模型可能不同。调用使用你的模型服务账户，无需部署到 Vercel，也不需要单独的 Web 后端。

确认 `.env` 被 Git 忽略：

```bash
git check-ignore .env
```

预期输出 `.env`。提交 `.env.example`，真实密钥只放在被忽略的 `.env` 中，执行记录中也不填写密钥。

## 第三步：新建 src/model.ts

```ts
import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const modelId = process.env.ANTHROPIC_MODEL?.trim();

if (!apiKey || !modelId) {
  throw new Error("请在 .env 中填写 ANTHROPIC_API_KEY 和 ANTHROPIC_MODEL");
}

const provider = createAnthropic({
  apiKey,
  baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || undefined,
});

export const model = provider(modelId);
```

这里有三个新概念：

1. `import "dotenv/config"` 只有导入动作，用来在读取变量前加载配置。
2. `?.trim()` 表示变量存在时才去除首尾空白。配置缺失时明确报错，避免把问题拖到请求发送后。
3. `export const model` 让其他文件能导入同一个模型对象。创建这个对象是在准备请求配置，真正调用发生在 generateText 或 streamText 时。

`baseURL` 为空时使用 provider 的默认地址；它应是 API 基础地址，不是浏览器聊天页面的地址。

## 第四步：先完成一次独立请求

新建 `src/ask.ts`：

```ts
import { generateText } from "ai";
import { model } from "./model.js";

try {
  const result = await generateText({
    model,
    prompt: "请用一句中文解释什么是 Agent。",
    maxOutputTokens: 300,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(60_000),
  });

  console.log(result.text);
} catch (error) {
  console.error("请求失败：", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
```

运行：

```bash
pnpm exec tsc
pnpm exec tsx src/ask.ts
```

预期：先等待模型完成，再一次性显示中文回答。措辞由模型决定，不要求与任何示例逐字一致。

为什么引用 `./model.js`，实际文件却是 model.ts？当前项目使用 NodeNext 的 ESM 规则，相对导入按 JavaScript 运行路径写后缀；TypeScript 会找到对应的 .ts 源码，tsx 也支持这种解析。不要为了消除疑惑再创建一个 model.js。

`await generateText(...)` 等待完整结果；`maxOutputTokens` 限制输出长度，不是字符数。`maxRetries: 0` 让学习时的一次失败直接显现；超时设置让单次请求最多等待约 60 秒。超时终止本地请求，不代表服务端一定停止计算。

这一小步验证配置、网络和 provider 接法。它成功后，再接入终端循环。

## 第五步：把流式回答接回 main.ts

更新 `src/main.ts` 为下面的代码。建议分段手写，先理解外层输入循环，再看内层模型事件循环。

```ts
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { streamText } from "ai";
import { model } from "./model.js";

const rl = createInterface({
  input: stdin,
  output: stdout,
  prompt: "你 > ",
});

let closing = false;
let activeRequest: AbortController | undefined;

rl.on("SIGINT", () => {
  closing = true;
  activeRequest?.abort();
  rl.close();
});

console.log("模型已就绪。输入 /exit 退出，Ctrl+C 中断并退出。");
rl.prompt();

try {
  for await (const line of rl) {
    if (closing) break;

    const input = line.trim();
    if (input === "/exit") break;
    if (!input) {
      rl.prompt();
      continue;
    }

    activeRequest = new AbortController();
    stdout.write("Agent > ");

    try {
      const result = streamText({
        model,
        prompt: input,
        maxOutputTokens: 800,
        maxRetries: 0,
        abortSignal: AbortSignal.any([
          activeRequest.signal,
          AbortSignal.timeout(60_000),
        ]),
      });

      for await (const event of result.fullStream) {
        if (event.type === "text-delta") {
          stdout.write(event.text);
        } else if (event.type === "error") {
          throw event.error;
        }
      }
    } catch (error) {
      const message = closing
        ? "已中断当前请求"
        : error instanceof Error ? error.message : String(error);
      console.error(`\n请求失败：${message}`);
    } finally {
      activeRequest = undefined;
      stdout.write("\n");
    }

    if (closing) break;
    rl.prompt();
  }
} finally {
  rl.close();
  console.log("已退出。");
}
```

运行：

```bash
pnpm exec tsc
pnpm run dev
```

输入“请用三点解释终端 Agent 的组成”。这次回答会按片段追加到终端，不必等完整回答生成后才显示。响应很快时肉眼可能看不出明显间隔。

## 理解两层循环

```text
外层：等待用户输入一行
    ↓
发送本轮文字给模型
    ↓
内层：读取这次响应的事件流
    ↓
文字片段 → 追加到终端
    ↓
响应结束 → 再显示提示符 → 等待下一轮输入
```

`generateText` 等完整结果，`streamText` 返回可消费的响应流。流式输出只是交付方式，模型并不会因此自动获得记忆或工具。

`fullStream` 中的事件不全是文字，因此先检查 `event.type`。文本事件携带 `event.text`；错误事件显式抛出，让内层 catch 显示错误后继续下一轮。不要只添加 try/catch，却忽略流中的 error 事件。

`stdout.write()` 不自动换行，适合拼接模型片段；如果每片都用 console.log，会把回答拆成很多行。finally 中补一个换行，分开回答和下一个提示符。

`AbortController` 管理当前请求的取消信号。Ctrl+C 会关闭输入接口并取消正在等待的请求；`AbortSignal.any` 将手动取消与超时组合。本阶段 Ctrl+C 是“中断并退出”，不是仅取消回答后继续聊天。

`/exit` 由外层循环处理，模型正在回答时外层还在等待内层结束；要立即中断请用 Ctrl+C。学习时等下一次 `你 >` 出现再发送新问题，暂不练习多行粘贴或并发输入。

## 验收

| 操作 | 预期结果 |
|---|---|
| `pnpm exec tsc` | 无类型错误 |
| 运行 ask.ts | 输出一次模型回答并退出 |
| main.ts 中输入正常问题 | 模型回答，不再是原样回声 |
| 等提示符出现后输入第二个问题 | 可连续调用，无须重启 |
| 空行、全空格 | 不发送模型请求，重新显示提示符 |
| 提示符处输入 `/exit` | 正常返回 shell |
| 回答期间按 Ctrl+C | 中断当前请求并退出 |
| `git check-ignore .env` | 显示 .env，密钥不进入暂存区 |

可以做一个观察实验：第一轮说“我叫小林”，第二轮问“我叫什么”。当前只传 `prompt: input`，没有把第一轮发送给第二轮，因此模型不能可靠地知道你的名字；偶然猜中也不能证明有记忆。阶段 04 会显式保存和发送历史。

- [ ] 一次独立请求成功。
- [ ] 连续两次流式请求成功。
- [ ] 空输入和退出逻辑通过。
- [ ] 通过类型检查。
- [ ] 知道两层 for await 分别在等待什么。
- [ ] 知道 model 对象、provider 和 AI SDK 的分工。

## 排错

- 提示配置未填写：确认 .env 已保存、两个变量都有值，并从项目根目录启动。模型模块加载失败时，入口还没开始循环，需要修正后重启。
- 401/403：检查密钥、账户权限和服务地址。只分享脱敏错误，不贴密钥。
- 模型不存在：核对 ANTHROPIC_MODEL 是否是你服务端支持的完整 ID。
- 429：查看服务的配额或限流信息，稍后再试；本阶段不自动重试。
- 网络错误或超时：检查终端是否能访问该 API；兼容服务需要匹配 Anthropic 协议及正确的基础地址。
- 编辑器提示缺少模块：先确认 pnpm add 成功，再运行 pnpm exec tsc；保留上一阶段的 tsconfig.json。
- 已输出一部分文字后报错：这是失败的部分响应，本阶段会显示错误并回到提示符，不当作完整回答保存。

## 执行记录

- 使用的模型 ID（不填密钥）：待填写。
- 独立请求的命令和结果：待填写。
- 两轮流式输入与观察：待填写。
- 空行、/exit 和 Ctrl+C 的验证结果：待填写。
- 类型检查结果：待填写。
- 遇到的问题及解决方式：待填写。
- 我对 provider、model 和两层循环的理解：待填写。

## 第二次提交：实现与验证结果

完成验收，更新本文状态并填写记录后：

```bash
git status --short
git add package.json pnpm-lock.yaml .env.example src/model.ts src/ask.ts src/main.ts stages/03-model-streaming.md
git diff --cached
```

如果安装时确实修改了 pnpm-workspace.yaml，检查后单独暂存它。确认暂存内容没有 .env 或真实密钥，再提交：

```bash
git commit -m "finished: step03 model streaming"
```

完成后告诉助手，下一阶段单独编写对话历史与 system prompt 的说明。

## 参考

- [AI SDK streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [AI SDK 流式错误处理](https://ai-sdk.dev/docs/ai-sdk-core/error-handling)
- [Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)

本文按 AI SDK 6 与 Anthropic provider 3 编写；官网默认页可能描述更新的主版本，遇到差异时以本项目安装版本的类型定义为准。
