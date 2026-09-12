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