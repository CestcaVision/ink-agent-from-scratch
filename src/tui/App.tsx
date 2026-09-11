import { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";

export function App() {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [lastMessage, setLastMessage] = useState("还没有留言，输入一句话试试。");
  const [count, setCount] = useState(0);

  useInput((_text, key) => {
    if (key.escape) setInput("");
  });

  function handleSubmit(value: string) {
    const message = value.trim();
    setInput("");

    if (!message) return;
    if (message === "/exit") {
      exit();
      return;
    }
    if (message === "/clear") {
      setLastMessage("还没有留言，输入一句话试试。");
      setCount(0);
      return;
    }

    setLastMessage(message);
    setCount(previous => previous + 1);
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">手搓Agent· 终端留言板</Text>
        <Text dimColor>React 组件也能显示在终端里</Text>
      </Box>

      <Text>已提交 {count} 次</Text>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>最近留言</Text>
        <Text wrap="wrap">{lastMessage}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="green">你 &gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="输入一句话…"
        />
      </Box>

      <Text dimColor>Enter 提交 · Esc 清空输入 · /clear 重置 · /exit 退出</Text>
    </Box>
  );
}