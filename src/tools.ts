import { exec } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tool } from "ai";
import { z } from "zod";

export const WORKSPACE = resolve(process.cwd(), "agent-workspace");
const MAX_TEXT = 12_000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function preview(text: string) {
  return {
    text: text.slice(0, MAX_TEXT),
    truncated: text.length > MAX_TEXT,
  };
}

export const agentTools = {
  readfile: tool({
    description: "读取 UTF-8 文本文件。相对路径以工作目录为起点；不适合图片或二进制文件。",
    inputSchema: z.object({
      path: z.string().min(1).describe("文件路径，例如 expenses.json"),
    }),
    execute: async ({ path }, { abortSignal }) => {
      abortSignal?.throwIfAborted();
      const absolutePath = resolve(WORKSPACE, path);
      try {
        const content = await readFile(absolutePath, {
          encoding: "utf8", signal: abortSignal,
        });
        return { ok: true, path: absolutePath, ...preview(content) };
      } catch (error) {
        abortSignal?.throwIfAborted();
        return { ok: false, path: absolutePath, error: errorMessage(error) };
      }
    },
  }),

  writefile: tool({
    description: "写入完整 UTF-8 文本，自动创建父目录。文件存在时覆盖，不是追加或局部修改。",
    inputSchema: z.object({
      path: z.string().min(1).describe("目标路径，例如 report.md"),
      content: z.string().max(30_000).describe("文件完整内容，允许空字符串"),
    }),
    execute: async ({ path, content }, { abortSignal }) => {
      abortSignal?.throwIfAborted();
      const absolutePath = resolve(WORKSPACE, path);
      try {
        await mkdir(dirname(absolutePath), { recursive: true });
        abortSignal?.throwIfAborted();
        await writeFile(absolutePath, content, {
          encoding: "utf8", signal: abortSignal,
        });
        return { ok: true, path: absolutePath, bytes: Buffer.byteLength(content, "utf8") };
      } catch (error) {
        abortSignal?.throwIfAborted();
        return { ok: false, path: absolutePath, error: errorMessage(error) };
      }
    },
  }),

  run_command: tool({
    description: "在工作目录运行一次 shell 命令，返回 stdout、stderr 与退出码。限时 10 秒；用于短命令，不用于交互程序或后台服务。",
    inputSchema: z.object({
      command: z.string().min(1).max(4_000).describe("要实际执行的 shell 命令，例如 node summarize.mjs"),
    }),
    execute: async ({ command }, { abortSignal }) => {
      abortSignal?.throwIfAborted();
      const result = await new Promise<{
        ok: boolean;
        cwd: string;
        exitCode: number | null;
        stdout: string;
        stderr: string;
        truncated: boolean;
        error: string | null;
      }>((resolveResult) => {
        const child = exec(command, {
          cwd: WORKSPACE,
          encoding: "utf8",
          timeout: 10_000,
          maxBuffer: 256 * 1024,
          signal: abortSignal,
          killSignal: "SIGKILL",
        }, (error, stdout, stderr) => {
          const out = preview(stdout);
          const err = preview(stderr);
          resolveResult({
            ok: error === null,
            cwd: WORKSPACE,
            exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
            stdout: out.text,
            stderr: err.text,
            truncated: out.truncated || err.truncated,
            error: error ? error.message : null,
          });
        });
        child.stdin?.end();
      });
      abortSignal?.throwIfAborted();
      return result;
    },
  }),
};
