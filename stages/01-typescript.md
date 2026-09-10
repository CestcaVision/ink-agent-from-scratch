# 阶段 01：运行第一个 TypeScript 程序

[返回学习目录](../README.md) · [上一阶段](00-setup.md)

状态：已完成。你已确认运行成功，并提交为 `1dd5e06`（`finished: step01`）。实际入口输出为 `hello world`，达到了本阶段运行入口的目标。下方个人验收勾选和学习记录保留给你补充。

## 本阶段目标

亲手创建 `src/main.ts`，使用项目内安装的 tsx 执行它，并能解释开发依赖、入口文件和运行命令之间的关系。

完成时终端会输出：

```text
你好，我的 Agent 即将诞生！
```

## 起点与预期改动

你已完成 Corepack + pnpm 初始化，项目有 `package.json` 和 `pnpm-lock.yaml`，`src/` 还是空目录。

| 文件 | 本阶段改动 |
|---|---|
| `package.json` | 增加 TypeScript 开发依赖与 dev 命令 |
| `pnpm-lock.yaml` | 由 pnpm 更新实际依赖版本 |
| `src/main.ts` | 新增第一个 TypeScript 程序 |
| `stages/01-typescript.md` | 验收后填写执行记录 |

## 第一次提交：保存阶段说明

所有命令在 `ink-agent-from-scratch/` 根目录执行。先检查当前改动，再暂存说明：

```bash
git status --short
git add README.md stages/00-setup.md stages/01-typescript.md
git diff --cached
```

检查暂存差异后执行：

```bash
git commit -m "docs: add stage 01 TypeScript guide"
```

本说明编写时，`package.json` 和 `pnpm-lock.yaml` 尚未跟踪；它们会在第二次提交中随本阶段实现一起纳入 Git。

## 第一步：安装开发依赖

```bash
pnpm add -D typescript tsx @types/node
```

- `typescript` 提供类型检查器 `tsc`。
- `tsx` 运行 TypeScript 源文件。
- `@types/node` 提供 Node.js API 的类型定义。

`-D` 表示写入 `devDependencies`，用于开发和验证。打开 `package.json` 看新增内容；`pnpm-lock.yaml` 由工具管理，记录实际解析的依赖版本。

## 第二步：亲手创建入口文件

在 VS Code 中创建 `src/main.ts`，输入：

```ts
const message: string = "你好，我的 Agent 即将诞生！";

console.log(message);
```

逐段理解：

- `const message` 声明一个不能重新赋值的变量。
- `: string` 是 TypeScript 类型标注，约束这里应使用字符串。
- `console.log(message)` 把字符串输出到终端。

这个文件是目前的程序入口。后面会逐步从这里接入输入、模型和工具。

## 第三步：直接运行

```bash
pnpm exec tsx src/main.ts
```

`pnpm exec` 找到项目依赖中的命令；`tsx` 执行指定的 TypeScript 文件。确认终端出现预期文本。

程序运行成功不等于完成了 TypeScript 类型检查。tsx 负责执行，tsc 负责检查。

## 第四步：给运行命令起名字

编辑 `package.json` 的 `scripts`，新增 `dev`。保留其他已有字段；当前 scripts 可写成：

```json
"scripts": {
  "test": "echo \"Error: no test specified\" && exit 1",
  "dev": "tsx src/main.ts"
}
```

然后运行：

```bash
pnpm run dev
```

预期输出与第三步一致。执行 package.json 中的脚本时，pnpm 会把项目依赖中的命令加入可搜索路径，所以这里直接写 `tsx`。

现有 `test` 是初始化生成的占位命令，本阶段不使用它。

## 验收

完成后勾选，并把真实结果填入下方记录：

- [ ] `package.json` 包含三个开发依赖。
- [ ] `src/main.ts` 是自己输入的，能解释其中每一行。
- [ ] `pnpm exec tsx src/main.ts` 输出预期文本。
- [ ] `pnpm run dev` 输出相同文本。
- [ ] 能说明 tsx 执行与 tsc 类型检查的区别。

如果报错：先确认终端位于项目根目录、文件已保存为 `src/main.ts`，以及依赖安装已经成功。将执行命令和完整错误发给助手，排查后再提交。

## 执行记录

执行后由你填写；保留遇到的问题和最终结果，方便回顾。

- 实际运行命令：待填写。
- 实际输出：待填写。
- 遇到的问题及解决方式：待填写；没有则写“无”。
- 我对 tsx 和 TypeScript 的理解：待填写。

## 第二次提交：保存实现与验证结果

验收通过后，把文件开头状态改为“已完成”，填写记录，再运行：

```bash
git status --short
git add package.json pnpm-lock.yaml src/main.ts stages/01-typescript.md
git diff --cached
```

检查暂存差异后执行：

```bash
git commit -m "feat: complete stage 01 TypeScript entry"
```

提交后把结果告诉助手。下一阶段会新增独立的 `stages/02-terminal-input.md`，开始让程序读取你的输入。
