# 阶段 05：轻量 Ink TUI 体验

[返回学习目录](../README.md) · [上一阶段](04-history-system.md)

状态：已完成。用户已完成操作，类型检查通过。

## 本阶段做什么

前四阶段已经让模型可以连续对话。这次暂缓 Agent 演进，单独做一个很小的终端留言板，让学生体验“在终端里写 React”。

实现标题和边框、文字输入、最近一次留言、提交计数、清空与退出。

```text
╭──────────────────────────────────────────────╮
│ INK LAB · 终端留言板                          │
│ React 组件也能显示在终端里                    │
╰──────────────────────────────────────────────╯
已提交 1 次
╭──────────────────────────────────────────────╮
│ 最近留言                                     │
│ 你好，Ink！                                   │
╰──────────────────────────────────────────────╯
你 > 光标在这里
Enter 提交 · Esc 清空输入 · /clear 重置 · /exit 退出
```

上图展示结构，实际宽度随终端变化。本阶段不读取 .env、不导入 model.ts、不调用 DeepSeek。现有 `pnpm run dev` 继续运行阶段 04 的 Agent，新增 `pnpm run tui` 运行这个练习。

## 学习目标与文件

你会接触 JSX、React 组件、useState、事件处理，以及 Ink 的 Box、Text、useInput、useApp。先把界面和交互跑起来，不引入网络、持久化或复杂组件库。

| 文件 | 本阶段改动 |
|---|---|
| `package.json`、`pnpm-lock.yaml` | 安装界面依赖，增加 tui 命令 |
| `tsconfig.json` | 支持 TSX 和 React 类型 |
| `src/tui.tsx` | 启动 Ink 界面 |
| `src/tui/App.tsx` | 留言板组件与状态 |
| `stages/05-ink-tui.md` | 验收和执行记录 |

不修改现有 src/main.ts、model.ts、system.ts、ask.ts。

## 第一次提交：保存说明

在项目根目录执行：

```bash
git status --short
git add README.md stages/05-ink-tui.md
git diff --cached
```

检查后提交：

```bash
git commit -m "plan: step05 lightweight Ink TUI"
```

## 第一步：安装界面依赖

继续使用 Corepack 管理的 pnpm，在项目根目录执行：

```bash
pnpm add -E ink@6.8.0 react@19.2.8 ink-text-input@6.0.0
pnpm add -DE @types/react@19.2.18
```

本阶段使用已在参考项目中验证的版本组合：

- React 负责组件和状态。
- Ink 把 React 组件渲染成终端内容。
- ink-text-input 提供现成的单行输入框。
- @types/react 提供 React 类型定义。

没有使用浏览器，因此不需要 react-dom、HTML 页面或 Vite。源码仍由已有的 tsx 执行。

## 第二步：让 TypeScript 认识 TSX

更新项目根目录的 tsconfig.json 为：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node", "react"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

与上一版相比，新增 React 类型、JSX 配置和 .tsx 文件的检查范围。**`.tsx` 是允许写 JSX 的 TypeScript 文件扩展名；命令工具 `tsx` 则负责运行源码，它们是两个不同概念。**

## 第三步：先画一个静态界面

新建 `src/tui.tsx`，先写这一版：

```tsx
import { Box, Text, render } from "ink";

function App() {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">INK LAB · 终端留言板</Text>
      <Text>这是我的第一个 Ink 界面。</Text>
    </Box>
  );
}

render(<App />);
```

在 package.json 的 scripts 中新增下面这一项，保留已有项，注意相邻项之间需要逗号：

```json
"tui": "tsx src/tui.tsx"
```

运行：

```bash
pnpm exec tsc
pnpm run tui
```

预期看到带青色边框的标题；这版还没有输入框。看完后，如程序仍在运行，按 Ctrl+C 退出。

### 看懂这几个标签

`App` 是一个函数组件，返回 JSX 来描述界面。`<App />` 表示使用这个组件，`render` 把它挂载到终端。

`Box` 是布局容器：`flexDirection="column"` 让内部内容纵向排列；`paddingX={1}` 增加左右留白；边框和颜色由属性配置。

`Text` 用来显示文字，文字内容放进 Text 中。这里没有浏览器 DOM，不使用 div、input 或浏览器 CSS。

JSX 属性中的引号传字符串，花括号里可以放 JavaScript 表达式，例如 `paddingX={1}` 传的是数字。

## 第四步：加入状态和输入

新建目录 `src/tui/`，在其中创建 `App.tsx`。将界面组件放到这个文件，写入：

```tsx
import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";

export function App() {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [lastMessage, setLastMessage] = useState("还没有留言，输入一句话试试。");
  const [count, setCount] = useState(0);

  useInput((_text, key) => {
    if (key.escape) setInput("");
  });

  function handleSubmit(value: string) {
    const message = value.trim();
    setInput("");

    if (!message) return;
    if (message === "/exit") {
      exit();
      return;
    }
    if (message === "/clear") {
      setLastMessage("还没有留言，输入一句话试试。");
      setCount(0);
      return;
    }

    setLastMessage(message);
    setCount(previous => previous + 1);
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">INK LAB · 终端留言板</Text>
        <Text dimColor>React 组件也能显示在终端里</Text>
      </Box>

      <Text>已提交 {count} 次</Text>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>最近留言</Text>
        <Text wrap="wrap">{lastMessage}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="green">你 &gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="输入一句话…"
        />
      </Box>

      <Text dimColor>Enter 提交 · Esc 清空输入 · /clear 重置 · /exit 退出</Text>
    </Box>
  );
}
```

然后把 `src/tui.tsx` 的静态演示替换成启动入口：

```tsx
import { render } from "ink";
import { App } from "./tui/App.js";

if (!process.stdin.isTTY) {
  throw new Error("请在 VS Code 终端等交互式终端中运行 pnpm run tui。");
}

const app = render(<App />);
await app.waitUntilExit();
```

相对导入继续遵守 NodeNext 的 .js 后缀规则，实际源码是 App.tsx。入口负责启动，App 负责界面行为。`isTTY` 检查输入是否来自交互式终端；`waitUntilExit` 等待界面结束。

## 第五步：理解界面怎么变化

```text
输入文字 → onChange → setInput → 输入框更新
按 Enter → handleSubmit → 修改留言和计数 → 留言板更新
```

`useState` 给组件保存状态，例如 `[input, setInput]` 分别是当前值和更新它的函数。用 setInput 更新值后，React 会重新计算界面；Ink 再更新终端显示。

`TextInput` 是受控输入框：显示什么由 `value={input}` 决定，输入变化通过 `onChange={setInput}` 更新状态。只给 value 而不处理 onChange，会导致无法正常更新输入内容。

`onSubmit` 在 Enter 时调用 handleSubmit。这里先清空输入，再处理命令或更新留言；/clear 和 /exit 会提前 return，所以它们不计入留言次数。

`setCount(previous => previous + 1)` 根据之前的状态计算下一次计数。计数依赖旧值时，用这种写法能让更新关系更明确。

`useInput` 监听键盘，用 Esc 清除还没提交的文字；它不会清空已经提交的留言。`useApp` 提供 Ink 的 exit 方法，/exit 用它退出。Ctrl+C 也可通过 Ink 默认行为退出。

**这里没有 readline 循环。** Ink 和输入组件负责接收键盘事件，React 状态描述要显示什么；组件每次返回 JSX 是描述界面，不是向终端追加一份日志。

界面运行时，用 Text 展示状态；不要同时向同一个终端不断 console.log 或 stdout.write，否则会干扰 Ink 管理的显示区域。前四阶段的 main.ts 在另一个运行命令中使用，互不导入。

## 第六步：运行并体验

```bash
pnpm exec tsc
pnpm run tui
```

在 VS Code 的“终端”面板运行，不使用“输出”面板。按下面顺序体验：

| 操作 | 预期 |
|---|---|
| 启动 | 有标题、边框、输入框，计数为 0 |
| 输入 `你好，Ink！` 并回车 | 显示留言，计数为 1，输入框清空 |
| 再输入一句话 | 最近留言被替换，计数为 2 |
| 空行或全空格回车 | 留言和计数不变 |
| 输入文字后按 Esc | 只清空输入框 |
| 输入 `/clear` | 留言恢复初始提示，计数归零 |
| 输入包含字母 q 的句子 | 正常输入，不会意外退出 |
| 输入 `/exit` | 返回 shell；可以重新启动 |

这个程序只显示最近一次留言；退出再启动后状态归零。中文和长句的显示也请在学生实际使用的终端中试一下，界面在足够宽的终端中更容易观察。

## 小练习

三选一即可，先写下预期效果再修改：

1. 把标题颜色改成 magenta，说明改的是哪一个组件属性。
2. 增加 `/help`：在留言区显示命令说明，且不增加计数。
3. 给普通留言添加你自己的固定前缀，例如“同学说：”。

这些练习都可以在 handleSubmit 或 JSX 中完成，本阶段无需接入模型。完成后再讨论哪部分未来可以作为 Agent 的显示层。

## 验收与排错

- [x] 类型检查包含 .tsx 文件并通过。
- [ ] 界面正常显示，输入和留言计数符合上表。
- [ ] /clear、/exit 和 Esc 各自完成对应操作。
- [ ] 能解释 value、onChange、onSubmit 的关系。
- [ ] 能解释为什么 useState 更新后界面会变化。
- [ ] 能区分入口文件、界面组件、模型调用三者的职责。

出现 JSX 标红时，检查文件后缀是 .tsx、tsconfig 中包含 jsx 配置和 .tsx 路径；依赖已安装但仍标红时，先看 `pnpm exec tsc` 的结果。

出现 raw mode 或 TTY 错误时，切换到真实交互式终端运行。暂不通过管道重定向输入，也不在运行旧 Agent 的同一进程中创建这个界面。

如果出现构建脚本审批提示，执行 `pnpm approve-builds`，检查提示中的包名并批准所需依赖，再重试原命令。

## 执行记录

- 运行命令与终端环境：待填写。
- 普通输入、连续提交和空行结果：待填写。
- Esc、/clear、/exit 的结果：待填写。
- 类型检查结果：`pnpm exec tsc` 通过。
- 界面个性化：标题改为“手搓Agent· 终端留言板”。
- 我对“状态驱动界面”的理解：待填写。
- 遇到的问题及解决方式：待填写。

## 第二次提交：保存 TUI 实现

验收后更新本文状态、勾选清单并填写记录：

```bash
git status --short
git add package.json pnpm-lock.yaml tsconfig.json src/tui.tsx src/tui/App.tsx stages/05-ink-tui.md
git diff --cached
```

如果 pnpm-workspace.yaml 因安装操作发生变化，检查后再单独暂存。确认提交中保留了原 main.ts 的 Agent 实现，再提交：

```bash
git commit -m "finished: step05 lightweight Ink TUI"
```

本阶段完成后，先回顾界面体验，再继续讨论下一阶段如何恢复 Agent 演进。

参考：[Ink](https://github.com/vadimdemedes/ink) · [ink-text-input](https://github.com/vadimdemedes/ink-text-input)。
