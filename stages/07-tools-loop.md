# 阶段 07：第一个工具与多步执行循环

[返回学习目录](../README.md) · [上一阶段](06-ink-chat.md)

状态：实现已提交（`f77c9c1`，`finished: step07 tools and agent loop`）。实际课堂验收记录仍可在下方补充。

## 目标：让模型取得它原本不知道的信息

step06 已经可以在 Ink 中与 DeepSeek 连续对话。本阶段增加一个真实的本地工具：查询指定时区的当前日期和时间。

工具读取运行程序的电脑时钟，因此结果依赖电脑时间是否准确；它不是网络授时服务。模型收到结果后，再组织自然语言回答。

本阶段重点是观察这个过程：

```text
用户：上海现在几点？
  ↓ 第 1 次模型生成
模型提出 getCurrentTime({ timeZone: "Asia/Shanghai" })
  ↓ SDK 校验参数，调用本地 execute
工具返回日期、时间和时区
  ↓ 第 2 次模型生成（请求中包含工具结果）
模型依据结果回答
```

模型提出工具名和参数，真正执行代码的是你的 Node.js 程序。本阶段用 AI SDK 的 stopWhen 驱动多步执行，先掌握调用与消息结构，不再额外手写一套 while 循环。

## 文件与范围

| 文件 | 操作 |
|---|---|
| `src/tools.ts` | 新建参数定义、时间函数和工具注册表 |
| `src/chat.ts` | 接入 tools、步数上限、执行事件 |
| `src/system.ts` | 补充调用时间工具的约定 |
| `src/tui/App.tsx` | 显示最近 8 条执行事件 |
| `README.md`、本文 | 目录、教程和执行记录 |

沿用现有 ai、zod 和 Ink 依赖，无需安装新包。model.ts、.env 和 tui.tsx 保持现有配置。使用 `pnpm run tui` 体验工具；旧 `pnpm run dev` 入口没有注册工具。

注意：system.ts 目前由两个入口共用，因此本阶段增加的工具提示也会出现在旧入口的请求中，但它不会让旧入口自动获得工具。本阶段的工具实验统一在 Ink 入口进行。

## 第一次提交：保存说明

所有命令在项目根目录执行：

```bash
git status --short
git add README.md stages/07-tools-loop.md
git diff --cached
git commit -m "plan: step07 tools and agent loop"
```

## 第一步：新建 src/tools.ts

先写普通函数，再用 tool 包装为模型可调用的接口：

```ts
import { tool } from "ai";
import { z } from "zod";

export const timeInputSchema = z.object({
  timeZone: z.enum(["Asia/Shanghai", "UTC", "America/New_York"])
    .describe("查询的时区：中国用 Asia/Shanghai，纽约用 America/New_York。"),
});

export function readCurrentTime(input: z.infer<typeof timeInputSchema>) {
  const { timeZone } = timeInputSchema.parse(input);
  const now = new Date();
  return {
    timeZone,
    isoUtc: now.toISOString(),
    localTime: new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      dateStyle: "full",
      timeStyle: "long",
      hourCycle: "h23",
    }).format(now),
  };
}

export const agentTools = {
  getCurrentTime: tool({
    description: "读取运行本程序的电脑时钟，查询指定时区的当前日期和时间。",
    inputSchema: timeInputSchema,
    execute: async input => readCurrentTime(input),
  }),
};
```

三个核心字段：

- description：告诉模型工具能做什么、什么时候适合使用。
- inputSchema：描述参数结构，也用于运行时校验。
- execute：参数通过校验后，由 SDK 调用的本地函数，返回结果。

工具名来自 agentTools 的键 `getCurrentTime`。函数名 readCurrentTime 是程序内部名字，模型看到的是工具注册名。

`z.enum` 只允许三个已支持的时区。`z.infer` 从 schema 推导 TypeScript 类型；函数内 parse 则在运行时校验输入。类型检查与运行时校验作用不同，模型返回的参数不能仅依赖 TypeScript 检查。

`new Date()` 获取一个时间点。isoUtc 用 UTC 表示它，localTime 按指定时区格式化。同一次调用中的两种表示来自同一个 now。

### 先单独运行普通函数

这一步不调用模型：

```bash
pnpm exec tsc
pnpm exec tsx -e 'import { readCurrentTime } from "./src/tools.ts"; console.log(readCurrentTime({ timeZone: "Asia/Shanghai" }));'
```

核对输出中的 timeZone、isoUtc 和 localTime。这里 console.log 用于独立命令，不是在运行中的 Ink 界面里打印。

检查非法参数会被拒绝：

```bash
pnpm exec tsx -e 'import { timeInputSchema } from "./src/tools.ts"; console.log(timeInputSchema.safeParse({ timeZone: "Bad/Zone" }).success);'
```

应输出 false。这样先确认工具本身可用，再接入模型，便于分清问题发生在哪一层。

## 第二步：更新 src/chat.ts

替换为下面这版，重点关注 agentTools、stopWhen 和新增的流事件：

```ts
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { agentTools } from "./tools.js";
import { model } from "./model.js";
import { SYSTEM_PROMPT } from "./system.js";

export async function chat(options: {
  history: ModelMessage[];
  input: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
  onEvent?: (text: string) => void;
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
    tools: agentTools,
    stopWhen: stepCountIs(3),
    system: SYSTEM_PROMPT,
    messages,
    maxOutputTokens: 800,
    maxRetries: 0,
    abortSignal: signal,
  });

  let step = 0;
  let toolFailed = false;
  for await (const event of result.fullStream) {
    if (event.type === "text-delta") {
      options.onDelta(event.text);
    } else if (event.type === "start-step") {
      step += 1;
      if (step > 1) options.onDelta("\n");
      options.onEvent?.(`开始模型生成第 ${step} 步`);
    } else if (event.type === "tool-call") {
      options.onEvent?.(`调用 ${event.toolName} [${event.toolCallId}]：${JSON.stringify(event.input)}`);
    } else if (event.type === "tool-result") {
      options.onEvent?.(`结果 [${event.toolCallId}]：${JSON.stringify(event.output)}`);
    } else if (event.type === "tool-error") {
      toolFailed = true;
      options.onEvent?.(`工具失败 [${event.toolCallId}]：${String(event.error)}`);
    } else if (event.type === "finish-step") {
      options.onEvent?.(`第 ${step} 步结束：${event.finishReason}`);
    } else if (event.type === "error") {
      throw event.error;
    }
  }

  signal.throwIfAborted();
  if (toolFailed) throw new Error("本轮发生工具错误，未保存到历史。");
  const finishReason = await result.finishReason;
  if (finishReason === "tool-calls") {
    throw new Error("已停止在工具调用阶段（最多 3 次模型生成），本轮未保存。");
  }
  if (finishReason !== "stop") {
    throw new Error(`本轮结束原因是 ${finishReason}，未保存到历史。`);
  }
  const response = await result.response;
  signal.throwIfAborted();
  return [...messages, ...response.messages];
}
```

### stopWhen 限制的是什么？

AI SDK 默认只进行一次模型生成。提供可执行工具并设置 `stopWhen: stepCountIs(3)` 后，SDK 在工具执行完成、满足继续条件时，会带着工具结果再次请求模型，最多进行 3 次模型生成。

它不表示 3 轮用户对话，也不表示最多调用 3 个工具：一次模型生成可能提出多个工具调用。一旦模型完成普通回答，循环可以在达到上限前结束。

通常查一次时间只需两步：提出调用、收到结果后回答。如果在第 3 步仍以 tool-calls 结束，本例报告停止并不保存本轮。最后一步提出的工具仍可能已执行；步数限制控制模型生成次数，不是事务回滚机制。

60 秒超时仍覆盖这一整个 chat 调用；maxOutputTokens 为每次模型生成的输出限制，不是整轮所有步骤的总预算。多步调用会产生多次模型请求。

### onEvent 与 onDelta

onDelta 传递模型文字；onEvent 传递程序观察到的执行信息。它们都通过回调交给 Ink，chat.ts 不直接打印。

`onEvent?: ...` 表示可选参数；`options.onEvent?.(...)` 表示只有提供了这个函数才调用。因此你可以先写好 chat.ts，之后再更新 App。

| 事件 | 含义 |
|---|---|
| start-step | 开始一次模型生成 |
| text-delta | 模型输出一段文字 |
| tool-call | 模型提出工具调用，不等于执行成功 |
| tool-result | 工具返回成功结果 |
| tool-error | 工具调用或执行发生错误 |
| finish-step | 当前模型生成结束，查看它的结束原因 |

toolCallId 用来对应一次调用和它的结果。如果模型同一步提出多个调用，不能只按屏幕先后顺序判断对应关系。

新步骤开始时插入换行，避免模型调用前说的话与调用后回答粘在一起。

### 为什么仍检查最终 finishReason？

中间步骤以 tool-calls 结束是正常现象，表示模型要求使用工具。我们检查的是整个流程结束后 `result.finishReason` 的最终值；成功得到普通回答时才接受 stop。

本阶段采取简单策略：若出现过 tool-error，即使模型随后解释了错误，也不把这整轮写入成功历史。SDK 可能会让模型读到错误并继续，界面会显示过程；最后由 toolFailed 决定不保存。本例不是遇到工具错误立即中止整个 SDK 循环。

取消、超时、输出截断也继续沿用 step06 的处理。屏幕可能有部分输出，但历史不增加。以后工具若包含写入操作，“不保存历史”并不能撤销已经执行的操作。

## 第三步：更新 src/system.ts

```ts
export const SYSTEM_PROMPT = `你是一位中文编程导师。
先用一句话回答核心问题，再给一个简短例子。
根据用户的已有知识解释术语，避免一次引入过多新概念。
不确定的事实请明确说明；用户没有提供的信息不要编造。
当用户询问当前日期或时间时，必须调用 getCurrentTime，并依据返回结果回答。
该工具仅支持 Asia/Shanghai、UTC、America/New_York；用户没指定时区时用 Asia/Shanghai。
遇到不支持的时区，请说明当前范围并请用户选择，不要擅自替换。
普通编程问题不需要调用时间工具；不要编造工具结果。`;
```

提示词让模型知道何时使用工具；真正可调用的工具由 streamText 的 tools 参数提供。只写一句“你可以调用工具”并不会注册函数。

## 第四步：在 Ink 中显示过程

App.tsx 的输入、取消和历史处理继续沿用 step06。按下面四处修改，不用重写组件。

### 1. 添加执行日志状态

在其他 useState 附近添加：

```tsx
const [toolEvents, setToolEvents] = useState<string[]>([]);
```

### 2. 两处清空日志

在 `/clear` 分支的 `setHistory([])` 后面添加一次：

```tsx
setToolEvents([]);
```

在开始普通请求的 `setQuestion(message)` 前面也添加一次相同语句。这样显示的是本轮过程，而不是所有轮次混在一起。

### 3. 给 chat 传入 onEvent

在 `chat({ ... })` 中，与 onDelta 并列添加：

```tsx
onEvent(text) {
  if (!closing.current && !controller.signal.aborted) {
    setToolEvents(previous => [...previous, text].slice(-8));
  }
},
```

这里保留取消和退出保护。slice(-8) 限制的是界面日志条数，不会裁剪模型历史，也不会改变 SDK 循环。

### 4. 添加执行过程面板

放在回答框之后、显示 status 的 Text 之前：

```tsx
<Box flexDirection="column" borderStyle="round" paddingX={1}>
  <Text bold>执行过程（最近 8 条）</Text>
  {toolEvents.length === 0 ? <Text dimColor>暂无事件</Text> :
    toolEvents.map((line, index) => <Text key={index}>{line}</Text>)}
</Box>
```

这些日志行只是无内部状态的 Text，当前用位置索引作 key。以后若把行升级为可展开、可交互组件，再为事件添加稳定 ID。

完成后运行：

```bash
pnpm exec tsc
pnpm run tui
```

## 第五步：观察一次完整工具循环

输入：

```text
请调用工具查询上海当前日期和时间，并根据结果回答。
```

预期过程类似下面的结构，具体 ID、时间和措辞会变化：

```text
开始模型生成第 1 步
调用 getCurrentTime [某个 ID]：{"timeZone":"Asia/Shanghai"}
结果 [同一个 ID]：{实际返回的时间数据}
第 1 步结束：tool-calls
开始模型生成第 2 步
第 2 步结束：stop
```

工具执行与事件显示可能交错，重点核对调用名、参数、同一个 ID 的结果，以及后续模型生成。工具时间应该与电脑时钟对应，最终回答应依据结果。

如果模型只是说“我已查询”却没有 tool-call 和 tool-result 事件，这不算完成工具调用。先检查 tools 是否传入 chat、system 是否更新、是否运行了 tui 入口。服务端若明确返回工具协议错误，保留去除密钥的报错再排查当前模型与接口支持情况；普通聊天能运行不代表所有工具特性都已验证。

## 第六步：观察消息历史

完成查时间后输入 `/history`。典型的单工具、两步流程是：

```text
user → assistant → tool → assistant
```

第一条 assistant 包含工具调用，tool 消息包含执行结果，最后的 assistant 包含基于结果的回答。实际数量以 SDK 返回为准，不要再假定所有成功轮次都只增加两条。

仍然使用 `response.messages` 保存完整结构，不能只把界面里的 answer 字符串保存下来，否则下一次模型请求就丢失了工具调用及结果。

接着问“刚才查的是哪个时区？”，观察它能否参考历史。再问“现在重新查一次 UTC 时间”，确认出现新调用，而不是直接复述旧时间。

## 第七步：对照实验

| 操作 | 检查重点 |
|---|---|
| 问“用一句话解释 TypeScript 的联合类型” | 一般直接回答，没有时间工具调用；仍有模型步骤日志 |
| 查询纽约当前时间 | timeZone 为 America/New_York |
| 查询不支持的时区 | 模型应说明范围并让用户选择；schema 也限制了实际参数 |
| 输入 /clear | 历史、问答、执行面板清空 |
| 生成中按 Esc | 请求取消，本轮不保存；不能撤销已经完成的读时钟操作 |
| 下一轮再次提问 | 可正常恢复 |

### 亲眼看到步数上限

临时把 `stepCountIs(3)` 改为 `stepCountIs(1)`，重启并明确要求调用时间工具。观察工具可能已经返回，但没有下一次模型生成来组织答案，最终提示停止在工具调用阶段，历史不增加。

模型如果没有提出工具调用，这次实验没有触发目标路径；以面板是否出现调用事件为准。完成后必须恢复为 3，再验证正常两步流程。

### 小练习

在 `src/tools.ts` 返回值中增加 `timestampMs: now.getTime()`，查询一次时间，在工具结果中找到这个字段。解释为什么模型能收到它，而不需要改 inputSchema。

## 验收清单

- [ ] 类型检查通过，工具单独运行成功。
- [ ] 非法时区 schema 校验返回 false。
- [ ] 能观察到 tool-call、tool-result 与后续模型生成。
- [ ] 回答使用了工具返回的时间与时区。
- [ ] 历史中包含结构化工具调用和结果。
- [ ] 普通编程问题可直接回答。
- [ ] /clear 和取消后的恢复正常。
- [ ] 完成步数上限实验，并恢复 stepCountIs(3)。
- [ ] 能解释“模型决定调用，程序执行函数”。

助手已在独立临时目录检查示例类型，并用模拟模型验证两步调用、工具消息续接、三步停止和非法参数错误路径。这不替代你通过真实 DeepSeek API 完成上面的实验。

## 执行记录

- 模型 ID（不写密钥）：待填写。
- 查时间的实际参数、结果和生成步数：待填写。
- /history 的角色序列：待填写。
- 普通问题是否调用工具：待填写。
- 步数上限实验与恢复结果：待填写。
- 取消与再次提问结果：待填写。
- 类型检查、小练习和遇到的问题：待填写。

## 第二次提交：保存实现

完成后更新状态、验收清单与执行记录，确认步数上限已恢复为 3：

```bash
git status --short
git add src/tools.ts src/chat.ts src/system.ts src/tui/App.tsx stages/07-tools-loop.md
git diff --cached
git commit -m "finished: step07 tools and agent loop"
```

下一阶段：[读写文件与执行命令](08-computer-tools.md)，先用三个工具完成真实电脑任务；Skills 按需加载顺延到 step09。

参考：[AI SDK 工具调用与多步执行](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)。本教程按项目已安装的 AI SDK 6 随包文档与类型定义编写。
