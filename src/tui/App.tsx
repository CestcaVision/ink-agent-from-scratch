import { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { ModelMessage } from "ai";
import { chat } from "../chat.js";

export function App() {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [history, setHistory] = useState<ModelMessage[]>([]);
  const [toolEvents, setToolEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("输入一句话，开始对话。");
  const activeRequest = useRef<AbortController | null>(null);
  const closing = useRef(false);

  useEffect(() => {
    return () => { activeRequest.current?.abort(); };
  }, []);

  function quit() {
    closing.current = true;
    activeRequest.current?.abort();
    exit();
  }

  useInput((text, key) => {
    if (key.ctrl && text === "c") {
      quit();
      return;
    }
    if (key.escape) {
      if (activeRequest.current) {
        activeRequest.current.abort();
        setStatus("正在取消…");
      } else {
        setInput("");
      }
    }
  });

  async function handleSubmit(value: string) {
    if (activeRequest.current || closing.current) return;
    const message = value.trim();
    setInput("");
    if (!message) return;
    if (message === "/exit") { quit(); return; }
    if (message === "/history") {
      setStatus(`历史 ${history.length} 条：${history.map(item => item.role).join(" → ") || "空"}`);
      return;
    }
    if (message === "/clear") {
      setToolEvents([]);
      setHistory([]);
      setQuestion("");
      setAnswer("");
      setStatus("历史已清空，系统提示保留。");
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setToolEvents([]);
    setQuestion(message);
    setAnswer("");
    setStatus("正在生成…");

    try {
      const nextHistory = await chat({
        history,
        input: message,
        signal: controller.signal,
        onEvent(text) {
          if (!closing.current && !controller.signal.aborted) {
            setToolEvents(previous => [...previous, text].slice(-8));
          }
        },
        onDelta(text) {
          if (!closing.current && !controller.signal.aborted) {
            setAnswer(previous => previous + text);
          }
        },
      });
      controller.signal.throwIfAborted();
      if (!closing.current) {
        setHistory(nextHistory);
        setStatus("回答完成，已保存到历史。");
      }
    } catch (error) {
      if (!closing.current) {
        const detail = controller.signal.aborted
          ? "已取消"
          : error instanceof Error ? error.message : String(error);
        setStatus(`${detail}（本轮未保存；屏幕上可能保留部分回答）`);
      }
    } finally {
      activeRequest.current = null;
      if (!closing.current) setBusy(false);
    }
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">手搓 Agent · Ink 对话</Text>
      </Box>
      <Text>已保存 {history.length} 条消息（不含 system）</Text>
      <Text color="green">你：{question || "尚未提问"}</Text>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Text bold>Agent</Text>
        <Text>{answer || (busy ? "等待模型回应…" : "尚无回答")}</Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        <Text bold>执行过程（最近 8 条）</Text>
        {toolEvents.length === 0 ? <Text dimColor>暂无事件</Text> :
          toolEvents.map((line, index) => <Text key={index}>{line}</Text>)}
      </Box>
      <Text color={busy ? "yellow" : "gray"}>{status}</Text>
      {busy ? (
        <Text dimColor>生成中，按 Esc 取消；Ctrl+C 退出。</Text>
      ) : (
        <Box>
          <Text color="green">你 &gt; </Text>
          <TextInput value={input} onChange={setInput}
            onSubmit={value => { void handleSubmit(value); }} />
        </Box>
      )}

      <Text dimColor>/history · /clear · /exit · Esc 清空输入或取消请求</Text>
    </Box>
  );
}
