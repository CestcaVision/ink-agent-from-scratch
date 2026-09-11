# 阶段 04：对话历史与系统提示

[返回学习目录](../README.md) · [上一阶段](03-model-streaming.md)

状态：待执行。

## 目标与实际起点

阶段 03 已提交为 `52f58d7`，你使用 DeepSeek API 完成了流式回答。现有入口每次传 `prompt: input`，因此模型只收到当前一句话。

这一阶段让模型能回答“我刚才说了什么”，同时用 system 定义中文编程导师的回答方式。你还会加入两个本地命令，直接观察和清空历史。

你的 model.ts 使用 `createAnthropic`。它描述请求使用的协议，不代表后台一定是 Claude。DeepSeek 官方提供 Anthropic 格式兼容接口，所以本阶段保留你已经跑通的 model.ts 和 .env，不重新安装 provider，也不更换模型配置。[DeepSeek 官方说明](https://api-docs.deepseek.com/guides/anthropic_api/)

所有命令在 `ink-agent-from-scratch/` 根目录执行。

## 本阶段文件

| 文件 | 改动 |
|---|---|
| `src/system.ts` | 新增导师系统提示 |
| `src/main.ts` | 保存历史、发送 messages、处理本地命令 |
| `stages/04-history-system.md` | 完成后填写执行记录 |

现有 model.ts、ask.ts、依赖和 tsconfig.json 可以直接沿用。ask.ts 仍是阶段 03 的独立单次请求演示；本阶段的历史属于 main.ts 进程。

## 第一次提交：保存阶段说明

```bash
git status --short
git add README.md stages/03-model-streaming.md stages/04-history-system.md
git diff --cached
```

检查暂存内容后：

```bash
git commit -m "plan: step04 history and system"
```

## 第一步：理解消息数组

之前的调用是：

```ts
prompt: input
```

现在我们要传入完整的消息序列，例如：

```ts
const messages = [
  { role: "user", content: "我叫小林。" },
  { role: "assistant", content: "你好，小林。" },
  { role: "user", content: "我叫什么？" },
];
```

上面只用于理解结构，不需要把这段固定对话复制进程序。实际消息将在运行时产生。

- user 是用户输入。
- assistant 是模型已经给出的回答。
- 数组顺序就是对话顺序。

模型能够参考前面的内容，是因为程序在新请求里重新发送了它们。本阶段不依赖服务端自动保存会话，也没有修改或训练模型。

## 第二步：新建 src/system.ts

```ts
export const SYSTEM_PROMPT = `你是一位中文编程导师。
先用一句话回答核心问题，再给一个简短例子。
根据用户的已有知识解释术语，避免一次引入过多新概念。
不确定的事实请明确说明；用户没有提供的信息不要编造。`;
```

system 用来描述跨轮次的回答约定；user 消息表达本轮需求。这里把提示单独放进文件，便于之后修改角色，而不用改输入循环。

它是发给模型的指令，不是代码权限控制。将来需要限制工具能读写哪些文件时，必须由工具实现来校验。

## 第三步：理解这次保存历史的时机

本阶段使用两个数组：

```text
history：之前已经成功完成的轮次
    ↓
messages：history + 本轮用户输入
    ↓
请求模型并显示流式回答
    ↓
成功正常结束：history = messages + 本轮模型响应消息
失败、取消或截断：history 保持原样
```

这样，模型请求失败时，不会留下孤零零的一条 user 消息，也不会把半截回答当成完整历史。

终端可能已经显示失败请求的部分文字；那是显示结果，不等于已经保存到 history。失败后可以输入 `/history` 检查消息数量。

## 第四步：更新 src/main.ts

下面是本阶段完整入口。对照上一版，重点看 `ModelMessage`、`history`、本地命令、`messages`、`system` 和成功后的保存动作。其余输入、取消和流式输出逻辑延续阶段 03。

```ts
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { streamText, type ModelMessage } from "ai";
import { model } from "./model.js";
import { SYSTEM_PROMPT } from "./system.js";

const rl = createInterface({
  input: stdin,
  output: stdout,
  prompt: "你 > ",
});

let history: ModelMessage[] = [];
let closing = false;
let activeRequest: AbortController | undefined;

rl.on("SIGINT", () => {
  closing = true;
  activeRequest?.abort();
  rl.close();
});

console.log("输入 /history 查看历史摘要，/clear 清空历史，/exit 退出。");
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

    if (input === "/history") {
      console.log(`当前历史有 ${history.length} 条消息（不含 system）。`);
      history.forEach((message, index) => {
        console.log(`${index + 1}. ${message.role}`);
      });
      rl.prompt();
      continue;
    }

    if (input === "/clear") {
      history = [];
      console.log("对话历史已清空，系统提示保留。");
      rl.prompt();
      continue;
    }

    const messages: ModelMessage[] = [
      ...history,
      { role: "user", content: input },
    ];

    activeRequest = new AbortController();
    const requestSignal = AbortSignal.any([
      activeRequest.signal,
      AbortSignal.timeout(60_000),
    ]);

    console.log(`本次发送 ${messages.length} 条对话消息 + system。`);
    stdout.write("Agent > ");

    try {
      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages,
        maxOutputTokens: 800,
        maxRetries: 0,
        abortSignal: requestSignal,
      });

      for await (const event of result.fullStream) {
        if (event.type === "text-delta") {
          stdout.write(event.text);
        } else if (event.type === "error") {
          throw event.error;
        }
      }

      requestSignal.throwIfAborted();
      const finishReason = await result.finishReason;
      if (finishReason !== "stop") {
        throw new Error(`本轮结束原因是 ${finishReason}，未保存到历史。`);
      }

      const response = await result.response;
      history = [...messages, ...response.messages];
    } catch (error) {
      const message = closing
        ? "已中断当前请求"
        : error instanceof Error ? error.message : String(error);
      console.error(`\n请求失败：${message}（历史保持不变）`);
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

## 新代码逐处解释

**`type ModelMessage` 与 `ModelMessage[]`。** 前者仅导入类型定义，后者表示数组中的元素必须符合 SDK 的消息结构。TypeScript 会检查 role、content 等字段。

**`...history`。** 展开之前的消息到新数组中，随后追加本轮 user 消息。构造请求时没有直接修改 history，因此请求失败后自然保留上一次成功的状态。

**`messages` 替换 `prompt`。** 这次调用使用完整消息数组，所以去掉原来的 `prompt: input`，不要在同一次调用中同时传入二者。

**`system: SYSTEM_PROMPT`。** 每次请求都附带系统提示，但它不存进 history；因此 `/clear` 清空对话后，导师风格仍然存在。我们的消息计数明确不包含 system。

**`await result.response`。** 流消费完成后，取得 SDK 整理好的响应消息，再追加到历史。使用 response.messages 可以保留响应的结构化内容，后续接工具时也能沿用这种思路。[AI SDK 消息续接说明](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

**为什么检查取消信号与 finishReason？** 流结束不一定代表正常完成。用户取消、超时或达到输出上限，都可能留下不完整响应。本阶段只有 `stop` 才保存；`length` 表示输出达到上限。遇到 length 可缩短问题或适当提高 maxOutputTokens 后重试。后续工具课会重新讨论 tool-calls 的结束原因。

**本地命令用 `continue` 提前结束这一轮。** `/history` 和 `/clear` 不发给模型，也不进入历史。`/clear` 不清除终端已经显示过的文字，只清空接下来发送给模型的历史。

## 第五步：运行并观察记忆

```bash
pnpm exec tsc
pnpm run dev
```

按顺序输入，每次等提示符重新出现再发送下一句：

1. `/history`：启动时应为 0 条。
2. `我叫小林，正在学习 TypeScript。请简单确认。`
3. `/history`：本阶段通常是 2 条，依次为 user、assistant。
4. `我叫什么？我在学习什么语言？`
5. `/history`：通常是 4 条，顺序为 user、assistant、user、assistant。

两次实际请求的消息计数应从 1 变成 3（另加 system）。模型应能从历史中找到名字和语言；若回答不符合预期，先看消息计数，再检查是否保存并重发了响应。

这里的“通常”是因为计数以 SDK 返回的实际消息为准。当前没有工具，正常文本回复通常对应一条 assistant 消息。

## 第六步：验证清空与进程内记忆

输入 `/clear`，然后 `/history`，应回到 0 条。再问“我叫什么？”，模型没有收到先前名字，应说明不知道；它偶然猜中也不能证明有记忆。

退出程序并重新运行，同样从 0 条开始，因为 history 只是进程中的数组，还没有写入文件。长期持久化留到阶段 08。

再问一个编程问题，观察清空后 system 的导师约定仍然存在。提示词是对模型行为的约定，不能保证所有回答严格符合格式；消息结构与计数是本阶段更可靠的验收证据。

## 第七步：验证未完成的回答不入历史

先完成一轮并用 `/history` 记下数量。然后临时将 main.ts 的 `maxOutputTokens` 改为 `1`，重启后提出需要长回答的问题，观察是否出现 `length` 或服务端参数错误，再查看 `/history`。

无论是 length 还是请求被服务端拒绝，都不应新增成功历史。不同模型可能有最小输出预算，具体以实际响应为准。测试后恢复为 `800`，重新运行正常请求。

重启会清空之前的进程内历史，所以测试记录应比较同一进程中请求前后的数量。真实网络故障也应保持历史不变，不需要故意更改真实密钥来制造错误。

## 验收与范围

- [ ] 类型检查通过。
- [ ] 第一轮信息能在第二轮回答中被引用。
- [ ] 请求消息数随正常轮次增加，角色顺序正确。
- [ ] `/history`、`/clear` 不产生模型请求。
- [ ] 清空后历史数量为 0，system 继续使用。
- [ ] 重启后历史为空。
- [ ] 请求失败或截断时，未将不完整轮次写入历史。
- [ ] 能解释“屏幕内容、history、system”三者的区别。

历史会随轮次增加，每次请求发送的上下文也会增长。本阶段先做少量实验，自动裁剪和摘要放到后面的记忆阶段。现在没有文件持久化、工具调用或多会话隔离。

## 执行记录

- 使用的模型 ID（不填密钥）：待填写。
- 两轮实验的输入、实际回答与消息数量：待填写。
- `/clear` 后与重启后的结果：待填写。
- 截断或失败时的历史数量：待填写。
- system 对回答的实际影响：待填写。
- 类型检查结果：待填写。
- 遇到的问题与解决方式：待填写。
- 我对模型“记住”的理解：待填写。

## 第二次提交：保存实现与结果

完成后将本文状态改为“已完成”，填写记录，确认测试时临时改动的输出上限已恢复。

```bash
git status --short
git add src/system.ts src/main.ts stages/04-history-system.md
git diff --cached
```

检查后提交：

```bash
git commit -m "finished: step04 history and system"
```

完成后告诉助手。阶段 05 将用 React / Ink 替换当前输入输出界面；先保留已经跑通的模型和对话机制。
