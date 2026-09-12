import { tool } from "ai";
import { z } from "zod";

export const timeInputSchema = z.object({
  timeZone: z.enum(["Asia/Shanghai", "UTC", "America/New_York"])
    .describe("查询的时区：中国用 Asia/Shanghai，纽约用 America/New_York。"),
});

export function readCurrentTime(input: z.infer<typeof timeInputSchema>) {
  const { timeZone } = timeInputSchema.parse(input);
  const now = new Date();
  return {
    timeZone,
    isoUtc: now.toISOString(),
    localTime: new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      dateStyle: "full",
      timeStyle: "long",
      hourCycle: "h23",
    }).format(now),
  };
}

export const agentTools = {
  getCurrentTime: tool({
    description: "读取运行本程序的电脑时钟，查询指定时区的当前日期和时间。",
    inputSchema: timeInputSchema,
    execute: async input => readCurrentTime(input),
  }),
};