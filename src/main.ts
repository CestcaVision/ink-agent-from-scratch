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