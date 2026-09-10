import "dotenv/config";
import { createAnthropic } from "@ai-sdk/anthropic";

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const modelId = process.env.ANTHROPIC_MODEL?.trim();

if (!apiKey || !modelId) {
  throw new Error("请在 .env 中填写 ANTHROPIC_API_KEY 和 ANTHROPIC_MODEL");
}

const provider = createAnthropic({
  apiKey,
  baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || undefined,
});

export const model = provider(modelId);