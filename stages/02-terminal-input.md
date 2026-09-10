# 阶段 02：终端输入与输入循环

[返回学习目录](../README.md) · [上一阶段](01-typescript.md)

状态：待执行。

## 本阶段目标

把固定输出 `hello world` 的程序，改成可以连续接收你输入的终端程序：

```text
终端练习已启动。输入 /exit 退出。
你 > 你好
回声：你好
你 > 我正在学习 Agent
回声：我正在学习 Agent
你 > /exit
已退出。
```

本阶段的回应就是回显输入，没有调用模型。先把“输入 → 处理 → 输出 → 等待下一次输入”跑通，下一阶段再把处理环节接到 AI SDK。

## 起点与预期改动

阶段 01 已提交为 `1dd5e06`，当前 `src/main.ts` 是：

```ts
const message = "hello world"
console.log(message)
```

`package.json` 已有 `"dev": "tsx src/main.ts"`。本阶段使用 Node.js 内置的 `readline`，不需要安装新依赖。

| 文件 | 本阶段改动 |
|---|---|
| `src/main.ts` | 改为终端输入循环，处理空行和退出 |
| `stages/02-terminal-input.md` | 完成后填写验收和执行记录 |

所有命令都在 `ink-agent-from-scratch/` 根目录执行。

## 第一次提交：保存阶段说明

```bash
git status --short
git add README.md stages/01-typescript.md stages/02-terminal-input.md
git diff --cached
```

检查暂存区是本次文档改动，再提交：

```bash
git commit -m "plan: step02 terminal input"
```

接下来开始手写代码。

## 第一步：接收一行输入

打开 `src/main.ts`，把原来的两行替换为下面的内容。先输入这一版、运行一次，再加入循环规则。

```ts
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const rl = createInterface({
  input: stdin,
  output: stdout,
  prompt: "你 > ",
});

rl.prompt();

for await (const line of rl) {
  console.log(`回声：${line}`);
  break;
}
```

运行：

```bash
pnpm run dev
```

看到 `你 >` 后输入一句话并按 Enter。程序应该回显这一句话，然后结束。

### 这段代码做了什么

- `node:` 表示导入 Node.js 内置模块，这两个模块不用通过 pnpm 安装。
- `stdin` 是标准输入，在当前终端中接收键盘输入；`stdout` 是标准输出。
- `createInterface` 创建一个逐行读取输入的接口，变量名 `rl` 是 readline 的缩写。
- `prompt` 配置提示文字；`rl.prompt()` 才会把提示显示出来。
- `for await...of` 等待输入流中的下一行，再执行循环体。等待期间不会反复空转执行循环体。
- `` `回声：${line}` `` 是模板字符串，用反引号包住，`${line}` 插入变量值。
- `break` 结束循环；readline 的异步迭代器在提前结束时会关闭接口。

这里的 `line` 会被 TypeScript 推断为字符串，不必每个变量都手写 `: string`。项目已有 `"type": "module"`，本例在 tsx 下可以使用顶层 `for await`。

## 第二步：让程序持续接收输入

现在把整个 `src/main.ts` 更新为下面这一版。对照第一版看新增的规则：清理首尾空白、识别退出命令、跳过空输入、重新显示提示。

```ts
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const rl = createInterface({
  input: stdin,
  output: stdout,
  prompt: "你 > ",
});

console.log("终端练习已启动。输入 /exit 退出。");
rl.prompt();

try {
  for await (const line of rl) {
    const input = line.trim();

    if (input === "/exit") {
      break;
    }

    if (input.length === 0) {
      rl.prompt();
      continue;
    }

    console.log(`回声：${input}`);
    rl.prompt();
  }
} finally {
  rl.close();
  console.log("已退出。");
}
```

保存文件，重新运行 `pnpm run dev`。依次输入普通文本、空行、另一句文本和 `/exit`。

### 为什么这样组织

**`trim()` 清理输入。** `"  你好  "` 会变为 `"你好"`，只包含空格的行会变为空字符串。它只清理首尾空白，句子中间的空格会保留。

**`break` 和 `continue` 控制不同范围。** `/exit` 用 `break` 结束整个循环；空输入用 `continue` 跳过当前这一轮，继续等下一行。空输入分支要先显示提示，因为 `continue` 会跳过循环底部的 `rl.prompt()`。

**输出后再次提示。** 每处理完一句有效文本，调用 `rl.prompt()`，让你知道程序正在等待下一次输入。

**`finally` 负责收尾。** 正常退出或处理过程抛出异常，都会执行清理逻辑。异步迭代器本身也会在循环结束时关闭接口，这里显式写出 `rl.close()`，让资源的创建与清理关系更清楚。不要把 `rl.close()` 放进每轮正常处理的末尾，否则无法继续输入。

**这还是输入循环。** 每轮只是回显当前字符串，没有保存历史；终端里看得到旧内容，不代表未来的模型会自动记住它。

## 动手验收

这一步要验证多种输入，而不仅是“程序启动了”。

| 操作 | 预期结果 |
|---|---|
| 输入 `你好` 并回车 | 显示 `回声：你好`，随后再次出现提示符 |
| 再输入 `第二句话` | 同一进程继续回显，无须重启 |
| 直接按 Enter | 不输出空的回声，继续提示输入 |
| 输入几个空格再回车 | 与空行相同 |
| 输入 `  hello world  ` | 显示 `回声：hello world`，保留中间空格 |
| 输入 `/exit` | 不回显命令，显示 `已退出。`，返回 shell |
| 重新运行 `pnpm run dev` | 能重新进入输入循环 |

在 macOS 的交互式终端中，还可以在空输入行按 Ctrl+D，观察输入流结束后的收尾。Ctrl+C 可用于中断程序；本阶段以 `/exit` 作为主要退出验收路径，后续接入模型时再设计取消请求的行为。

- [ ] 普通输入和连续两轮输入通过。
- [ ] 空行和全空格输入通过。
- [ ] 首尾空白清理符合预期。
- [ ] `/exit` 正常退出，能够重新启动。
- [ ] 能解释 `break`、`continue`、`finally` 的用途。
- [ ] 能说明输入循环与对话记忆的区别。

## 常见问题

**运行后一直停在 `你 >`。** 这是在等你输入。输入文字后按 Enter，才形成一整行。

**只能输入一轮。** 检查是否还保留第一版无条件执行的 `break`，或在循环里调用了 `rl.close()`。

**回车后没有新提示符。** 检查普通输入与空输入两个分支是否都调用了 `rl.prompt()`。

**模板字符串原样输出 `${input}`。** 应使用反引号，而不是单引号或双引号。

**报错提到模块或顶层 await。** 先确认保存的是 `src/main.ts`，通过 `pnpm run dev` 运行，且 package.json 中保留了 `"type": "module"`。仍有报错时，把命令和错误发来一起排查。

## 执行记录

由你执行后填写，记录真实结果：

- 实际运行命令：待填写。
- 普通输入与连续输入结果：待填写。
- 空行与全空格输入结果：待填写。
- `/exit` 退出结果：待填写。
- 遇到的问题及解决方式：待填写；没有则写“无”。
- 我对输入循环和对话记忆的理解：待填写。

## 第二次提交：保存实现与验证结果

验收通过后，把本文状态改为“已完成”，勾选清单，填写执行记录。

```bash
git status --short
git add src/main.ts stages/02-terminal-input.md
git diff --cached
```

检查改动后提交：

```bash
git commit -m "finished: step02 terminal input"
```

提交后告诉助手。下一阶段会单独编写阶段 03 的说明，接入 AI SDK，让模型生成流式回答。

参考：[Node.js readline 文档](https://nodejs.org/api/readline.html)。
