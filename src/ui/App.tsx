import React, { useState, useEffect, useRef } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import type { PokeCodeRunner } from "../runner";
import { BANNER } from "./theme";
import { formatToolCall, previewOutput } from "./format";

interface LogItem {
  key: string;
  kind: "user" | "tool" | "result" | "plan" | "answer" | "final" | "status" | "info" | "error";
  text: string;
  isError?: boolean;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface AppProps {
  runner: PokeCodeRunner;
  cwd: string;
  contextFile?: string | null;
  hasMemory?: boolean;
}

export const App: React.FC<AppProps> = ({ runner, cwd, contextFile, hasMemory }) => {
  const { exit } = useApp();
  const [log, setLog] = useState<LogItem[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [working, setWorking] = useState(false);
  const [frame, setFrame] = useState(0);
  const counter = useRef(0);

  const push = (item: Omit<LogItem, "key">) =>
    setLog((prev) => [...prev, { ...item, key: `i${counter.current++}` }]);

  // Subscribe to runner events and start the tunnel once.
  useEffect(() => {
    const off = runner.on((e) => {
      switch (e.type) {
        case "connected":
          setConnected(true);
          push({ kind: "info", text: `Connected to Poke (id ${e.connectionId}). Type a task below.` });
          break;
        case "tunnel":
          if (e.event.kind === "error") push({ kind: "error", text: e.event.message, isError: true });
          else if (e.event.kind === "oauthRequired")
            push({ kind: "info", text: `Authorize Poke: ${e.event.authUrl}` });
          break;
        case "status":
          push({ kind: "status", text: e.message });
          break;
        case "activity":
          renderActivity(e.event, push);
          break;
        case "answer":
          push({ kind: e.final ? "final" : "answer", text: e.message });
          if (e.final) setWorking(false);
          break;
        case "error":
          push({ kind: "error", text: e.message, isError: true });
          setWorking(false);
          break;
      }
    });

    runner.start().catch((err) => push({ kind: "error", text: err.message, isError: true }));
    return off;
  }, [runner]);

  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 80);
    return () => clearInterval(t);
  }, [working]);

  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (text === "/exit" || text === "/quit") return exit();
    if (text === "/clear") return setLog([]);
    if (text === "/help") {
      push({
        kind: "info",
        text: "Type a task and Poke will work on it via the connected tools. Commands: /clear, /exit.",
      });
      return;
    }
    if (!connected) {
      push({ kind: "info", text: "Still connecting to Poke — try again in a moment." });
      return;
    }
    push({ kind: "user", text });
    setWorking(true);
    void runner.sendTask(text);
  };

  useInput((value, key) => {
    if (key.ctrl && value === "c") return exit();
    if (key.return) {
      const text = input;
      setInput("");
      submit(text);
    } else if (key.backspace || key.delete) {
      setInput((q) => q.slice(0, -1));
    } else if (value && !key.ctrl && !key.meta) {
      setInput((q) => q + value);
    }
  });

  const status = connected ? "● connected" : "○ connecting…";

  return (
    <Box flexDirection="column">
      <Static items={[{ key: "banner" }, ...log]}>
        {(item: any) =>
          item.key === "banner" ? (
            <Box key="banner" flexDirection="column" marginBottom={1}>
              <Text>{BANNER}</Text>
              <Text dimColor>
                poke · {cwd}
                {contextFile ? ` · context: ${contextFile}` : ""}
                {hasMemory ? " · memory" : ""}
              </Text>
            </Box>
          ) : (
            <LogLine key={item.key} item={item as LogItem} />
          )
        }
      </Static>

      {working && (
        <Box>
          <Text color="magenta">{SPINNER[frame]} </Text>
          <Text dimColor>Poke is working…</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={connected ? "green" : "yellow"}>{status} </Text>
        <Text color="magenta">❯ </Text>
        <Text>{input}</Text>
        <Text color="magenta">▌</Text>
      </Box>
    </Box>
  );
};

function renderActivity(
  event: { phase: string; tool: string; input: Record<string, unknown>; output?: string; isError?: boolean },
  push: (item: Omit<LogItem, "key">) => void
) {
  if (event.tool === "update_plan") {
    if (event.phase === "end") push({ kind: "plan", text: previewOutput(event.output ?? "", 30) });
    return;
  }
  if (event.phase === "start") {
    push({ kind: "tool", text: formatToolCall(event.tool, event.input) });
  } else {
    push({ kind: "result", text: previewOutput(event.output ?? "", 6), isError: event.isError });
  }
}

const LogLine: React.FC<{ item: LogItem }> = ({ item }) => {
  switch (item.kind) {
    case "user":
      return (
        <Box marginTop={1}>
          <Text color="magenta" bold>
            ❯{" "}
          </Text>
          <Text bold>{item.text}</Text>
        </Box>
      );
    case "tool":
      return (
        <Text color="cyan">
          {"  "}● {item.text}
        </Text>
      );
    case "result":
      return (
        <Box marginLeft={4}>
          <Text color={item.isError ? "red" : "gray"}>{item.text}</Text>
        </Box>
      );
    case "plan":
      return (
        <Box marginTop={1} marginLeft={2}>
          <Text color="magenta">{item.text}</Text>
        </Box>
      );
    case "answer":
      return (
        <Box marginTop={1}>
          <Text color="white">{item.text}</Text>
        </Box>
      );
    case "final":
      return (
        <Box marginTop={1} flexDirection="column">
          <Text color="green">✓ {item.text}</Text>
        </Box>
      );
    case "status":
      return <Text dimColor>{item.text}</Text>;
    case "info":
      return <Text color="blue">{item.text}</Text>;
    case "error":
      return (
        <Box marginTop={1}>
          <Text color="red">✗ {item.text}</Text>
        </Box>
      );
  }
};
