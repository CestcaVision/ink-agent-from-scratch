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