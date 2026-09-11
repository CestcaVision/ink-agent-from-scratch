# 阶段 06：把 DeepSeek 接入 Ink

[返回学习目录](../README.md) · [上一阶段](05-ink-tui.md)

状态：待执行。

## 目标

把 step05 的留言板变成真正的聊天界面：输入问题、看到流式回答、继续多轮对话。模型与 system 沿用 step04 已跑通的配置。

这一阶段先连接已有能力。原目录的“第一个工具与多步执行循环”顺延到 step07，后续阶段相应顺延。

界面只显示最近一次问题和回答，模型仍收到完整的成功历史。不要把“屏幕显示几条”与“发给模型几条”混为一谈。

## 本阶段文件

| 文件 | 改动 |
|---|---|
| `src/chat.ts` | 抽出一次流式对话，返回成功后的消息历史 |
| `src/tui/App.tsx` | 把留言交互升级为模型对话 |
| `src/tui.tsx` | 让组件处理 Ctrl+C 并取消请求 |
| `README.md`、本文 | 课程目录与学习记录 |

无需安装新依赖。model.ts、system.ts、.env 使用现有配置；不复制密钥到教程。`pnpm run dev` 保留 readline 版本，`pnpm run tui` 运行 Ink 版本。两个入口各自拥有进程内历史，不共享会话。

## 第一次提交：保存说明

在项目根目录执行，检查暂存内容后再提交：

```bash
git status --short
git add README.md stages/06-ink-chat.md
git diff --cached
git commit -m "plan: step06 Ink streaming chat"
```

## 第一步：先理解三层关系

```text
App.tsx：接收输入、保存界面状态、显示文字
    ↓ 调用 chat，并传入 onDelta 回调
chat.ts：构造消息、消费流、检查结束原因
    ↓ 使用已有 model
model.ts：DeepSeek 的连接配置
```

这次最关键的替换是：step04 收到片段后 `stdout.write(event.text)`，现在通过 `onDelta(event.text)` 通知界面；界面用 `setAnswer` 更新状态。

不要在 Ink 组件中导入 main.ts。它会启动另一个 readline 输入循环，与 Ink 争用终端。

## 第二步：新建 src/chat.ts

先写模型调用层。它不打印文字，也不直接修改界面。

```ts
import { streamText, type ModelMessage } from "ai";
import { model } from "./model.js";
import { SYSTEM_PROMPT } from "./system.js";

export async function chat(options: {
  history: ModelMessage[];
  input: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = [
    ...options.history,
    { role: "user", content: options.input },
  ];
  const signal = AbortSignal.any([
    options.signal,
    AbortSignal.timeout(60_000),
  ]);
  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    maxOutputTokens: 800,
    maxRetries: 0,
    abortSignal: signal,
  });

  for await (const event of result.fullStream) {
    if (event.type === "text-delta") options.onDelta(event.text);
    else if (event.type === "error") throw event.error;
  }

  signal.throwIfAborted();
  const finishReason = await result.finishReason;
  if (finishReason !== "stop") {
    throw new Error(`本轮结束原因是 ${finishReason}，未保存到历史。`);
  }
  const response = await result.response;
  signal.throwIfAborted();
  return [...messages, ...response.messages];
}
```

`options` 将本轮所需的数据放到一个对象中。`onDelta` 是调用方提供的函数；每收到一个文本片段，就调用一次。

`Promise<ModelMessage[]>` 表示这个异步函数成功后返回消息数组。这里构造新数组，只有正常结束才返回；失败、超时、取消或截断时抛错，不改传入的 history。

`AbortSignal.any` 将手动取消和 60 秒超时合并。流结束后仍检查信号与 finishReason，避免把半截回答保存成完整历史。这个阶段没有工具调用，继续要求正常结束原因为 `stop`。

写完先执行：

```bash
pnpm exec tsc
```

暂时不直接运行 chat.ts，它只导出函数，还没有界面调用它。

## 第三步：更新 src/tui/App.tsx

先读下面四组状态，再替换原来的留言板组件：

- input：还没发送的输入草稿。
- question、answer：当前屏幕显示的问题与回答。
- history：已成功完成、下次要发给模型的消息。
- busy、status：是否生成中以及提示文字。

```tsx
import { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { ModelMessage } from "ai";
import { chat } from "../chat.js";

export function App() {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [history, setHistory] = useState<ModelMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("输入一句话，开始对话。");
  const activeRequest = useRef<AbortController | null>(null);
  const closing = useRef(false);

  useEffect(() => {
    return () => { activeRequest.current?.abort(); };
  }, []);

  function quit() {
    closing.current = true;
    activeRequest.current?.abort();
    exit();
  }

  useInput((text, key) => {
    if (key.ctrl && text === "c") {
      quit();
      return;
    }
    if (key.escape) {
      if (activeRequest.current) {
        activeRequest.current.abort();
        setStatus("正在取消…");
      } else {
        setInput("");
      }
    }
  });

  async function handleSubmit(value: string) {
    if (activeRequest.current || closing.current) return;
    const message = value.trim();
    setInput("");
    if (!message) return;
    if (message === "/exit") { quit(); return; }
    if (message === "/history") {
      setStatus(`历史 ${history.length} 条：${history.map(item => item.role).join(" → ") || "空"}`);
      return;
    }
    if (message === "/clear") {
      setHistory([]);
      setQuestion("");
      setAnswer("");
      setStatus("历史已清空，系统提示保留。");
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setQuestion(message);
    setAnswer("");
    setStatus("正在生成…");

    try {
      const nextHistory = await chat({
        history,
        input: message,
        signal: controller.signal,
        onDelta(text) {
          if (!closing.current && !controller.signal.aborted) {
            setAnswer(previous => previous + text);
          }
        },
      });
      controller.signal.throwIfAborted();
      if (!closing.current) {
        setHistory(nextHistory);
        setStatus("回答完成，已保存到历史。");
      }
    } catch (error) {
      if (!closing.current) {
        const detail = controller.signal.aborted
          ? "已取消"
          : error instanceof Error ? error.message : String(error);
        setStatus(`${detail}（本轮未保存；屏幕上可能保留部分回答）`);
      }
    } finally {
      activeRequest.current = null;
      if (!closing.current) setBusy(false);
    }
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">手搓 Agent · Ink 对话</Text>
      </Box>
      <Text>已保存 {history.length} 条消息（不含 system）</Text>
      <Text color="green">你：{question || "尚未提问"}</Text>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Text bold>Agent</Text>
        <Text>{answer || (busy ? "等待模型回应…" : "尚无回答")}</Text>
      </Box>
      <Text color={busy ? "yellow" : "gray"}>{status}</Text>
      {busy ? (
        <Text dimColor>生成中，按 Esc 取消；Ctrl+C 退出。</Text>
      ) : (
        <Box>
          <Text color="green">你 &gt; </Text>
          <TextInput value={input} onChange={setInput}
            onSubmit={value => { void handleSubmit(value); }} />
        </Box>
      )}
      <Text dimColor>/history · /clear · /exit · Esc 清空输入或取消请求</Text>
    </Box>
  );
}
```

### 为什么还需要 useRef？

`useState` 的更新会触发界面渲染。`useRef` 保存跨渲染的可变值，但修改 `.current` 不会直接刷新界面。

这里 activeRequest 保存当前请求的取消控制器，也是一把同步的“正在请求”锁：一旦提交就立即赋值，避免在下一次渲染前重复发送。busy 则负责让界面显示生成中状态。

closing 用来标记退出，防止取消后的异步回调继续更新已经退出的界面。组件卸载时，useEffect 的清理函数也会取消尚未完成的请求。

### 请求为什么写在 handleSubmit 中？

发送是用户按 Enter 触发的操作，所以放在事件处理函数中。不要放到组件函数体里，否则每次流式更新导致重新渲染时，都可能发出新请求。

也不需要用 useEffect 监听 input 来发送；否则学生每输入一个字符就可能触发调用。这里 useEffect 只负责卸载清理。

### 流式回答为什么用 previous？

`setAnswer(previous => previous + text)` 将每个新片段追加到最新状态上，避免异步回调读到旧 answer 而丢失前面的片段。

### 生成时怎样处理输入？

生成期间暂时不渲染 TextInput，只保留 Esc 取消和 Ctrl+C 退出。完成或失败后输入框重新出现。

因此生成期间不能输入 /clear 或 /exit；先按 Esc 等取消完成，或直接按 Ctrl+C 退出。空闲时 Esc 仍然只清空草稿。

### 成功历史和失败画面

chat 成功返回后才调用 setHistory。失败时保留旧 history，但界面可能已经显示本轮问题和部分回答，status 会明确提示本轮未保存。

`/clear` 清空历史及最近问答，保留 system。`/history` 只更新提示文字，不请求模型。消息数按 SDK 返回的消息计算，本阶段正常文本对话通常每轮增加两条。

## 第四步：更新 src/tui.tsx

```tsx
import { render } from "ink";
import { App } from "./tui/App.js";

if (!process.stdin.isTTY) {
  throw new Error("请在交互式终端中运行 pnpm run tui。");
}

const app = render(<App />, { exitOnCtrlC: false });
await app.waitUntilExit();
```

新增的 `exitOnCtrlC: false` 关闭 Ink 默认的 Ctrl+C 退出处理，让 App 先调用 abort，再调用 exit。它必须与上一步的 Ctrl+C 处理一起使用，否则 Ctrl+C 将不能按预期退出。

## 第五步：运行并验证

```bash
pnpm exec tsc
pnpm run tui
```

这次会真正调用 DeepSeek，沿用 .env。启动时配置缺失会直接报错；如果 step04 的 `pnpm run dev` 也无法连接，先检查原有模型配置。

每次等输入框重新出现后，再执行下一步：

| 操作 | 观察 |
|---|---|
| 输入 `/history` | 历史为 0，不产生请求 |
| 输入“我叫小林，正在学 Ink，请简单确认。” | 回答逐步显示，成功后通常保存 2 条消息 |
| 输入“我叫什么？正在学什么？” | 能参考上一轮信息，历史通常变成 4 条 |
| 输入全空格 | 不发送，不改变历史 |
| 输入草稿后按 Esc | 草稿清空，历史不变 |
| 输入 `/clear`，再 `/history` | 最近问答清空，历史归零 |
| 再问“我叫什么？” | 模型没有收到此前名字；观察消息计数验证清空 |
| 输入 `/exit`，重启 | 返回 shell；重启后历史为空 |

回答短时可能看起来一次出现，这是模型与网络输出节奏造成的。可以要求解释一个概念并举例，观察较长文本，但无需一次生成大量内容。

### 验证取消与恢复

先完成一轮，记下已保存的消息数。再提一个较长的问题，在“生成中”时按 Esc：应显示取消提示，历史数量保持不变，随后可以再次输入普通问题。

如果按 Esc 前请求已经完成，它只会清空草稿。以当时状态为准，不要把已完成请求误判成取消失败。

再发起请求，生成中按 Ctrl+C，确认返回 shell。退出后重启不会保留历史。

### 验证不完整响应

可临时将 chat.ts 中 maxOutputTokens 调小，提出需要长回答的问题。若返回 length 或参数错误，应显示失败提示，不新增历史。验证后恢复为 800。

不同模型可能有最小输出限制。这里验收的是错误与截断不保存到历史，而不是必须出现某一句固定报错。

## 验收清单

- [ ] `pnpm exec tsc` 通过。
- [ ] Ink 中能收到真实模型的流式回答。
- [ ] 第二轮能参考第一轮信息。
- [ ] /history、/clear、空输入不会调用模型。
- [ ] 生成时输入框隐藏，不会重复提交。
- [ ] Esc 可取消生成，历史不增加，随后还能提问。
- [ ] Ctrl+C 和 /exit 能退出。
- [ ] 失败或截断不增加历史。
- [ ] 能说明 onDelta、useState、useRef 各自的作用。

本阶段暂不做滚动聊天记录、Markdown 渲染、持久化或工具调用。历史只存在内存中，教学实验先保持少量轮次；界面过长时缩短回答或扩大终端。后续再完善布局。

## 执行记录

- 模型 ID（不写密钥）：待填写。
- 流式回答的观察：待填写。
- 两轮对话与历史数量：待填写。
- 取消后历史及再次提问结果：待填写。
- 清空、退出、重启结果：待填写。
- 类型检查与错误处理结果：待填写。
- 我对“界面状态”和“模型历史”的理解：待填写。

## 第二次提交：保存实现

验收后更新本文状态、填写记录和勾选清单，确认临时输出限制已恢复。

```bash
git status --short
git add src/chat.ts src/tui/App.tsx src/tui.tsx stages/06-ink-chat.md
git diff --cached
git commit -m "finished: step06 Ink streaming chat"
```

参考：[Ink API](https://github.com/vadimdemedes/ink) · [AI SDK 流式生成](https://ai-sdk.dev/docs/ai-sdk-core/generating-text)。示例以本项目已安装的 Ink 6、AI SDK 6 为准。
