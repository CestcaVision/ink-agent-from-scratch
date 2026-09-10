# 从零搭建终端 Agent

技术栈：TypeScript → Vercel AI SDK → React / Ink。

这是动手练习目录。每次只加入一个概念，运行确认后再继续。完整参考项目位于旁边的 `../ink-agent-course/`。

## 学习路线

1. 初始化 Node.js 项目，运行第一个 TypeScript 文件。
2. 配置模型，用 AI SDK 完成一次调用。
3. 加入终端输入和流式输出。
4. 保存对话历史，加入 system prompt。
5. 用 React / Ink 构建交互界面。
6. 定义第一个工具，形成多步执行循环。
7. 按需加载 Skills。
8. 保存长期记忆并压缩历史。
9. 管理计划和待办。
10. 创建独立上下文的子 Agent。
11. 加入持久队友与消息箱。
12. 接入 MCP 和生命周期 Hooks。

## 当前步骤：初始化项目

在本目录运行：

```bash
npm init -y
```

观察生成的 `package.json`。它记录项目名称、运行命令和依赖；初始化尚不会调用模型。

下一步：安装 TypeScript 开发依赖，亲手编写 `src/main.ts`。
