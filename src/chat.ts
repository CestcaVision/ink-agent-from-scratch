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