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