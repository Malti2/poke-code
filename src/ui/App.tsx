import React, { useState, useEffect, useRef } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import { Agent, type AgentEvent } from "../agent/Agent";
import type { LlmProvider } from "../agent/provider";
import type { ToolDefinition } from "../tools/types";
import type { ProjectContext } from "../agent/context";
import { buildSystemPrompt } from "../agent/prompt";
import { BANNER } from "./theme";
import { formatToolCall, previewOutput } from "./format";

interface LogItem {
  key: string;
  kind: "user" | "assistant" | "tool" | "result" | "error" | "denied" | "info";
  text: string;
  isError?: boolean;
}

interface PendingApproval {
  label: string;
  resolve: (ok: boolean) => void;
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface AppProps {
  provider: LlmProvider;
  tools: ToolDefinition[];
  cwd: string;
  /** When true, mutating tools require y/n confirmation. */
  confirm: boolean;
  /** Project context file (POKE.md / AGENTS.md / …), if present. */
  context?: ProjectContext | null;
}

export const App: React.FC<AppProps> = ({ provider, tools, cwd, confirm, context }) => {
  const { exit } = useApp();
  const [log, setLog] = useState<LogItem[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [frame, setFrame] = useState(0);
  const counter = useRef(0);

  const agent = useRef<Agent | null>(null);
  if (!agent.current) {
    agent.current = new Agent({
      provider,
      tools,
      system: buildSystemPrompt(cwd, context),
      cwd,
      approver: confirm
        ? ({ name, input }) =>
            new Promise<boolean>((resolve) =>
              setPending({ label: formatToolCall(name, input), resolve })
            )
        : undefined,
    });
  }

  const push = (item: Omit<LogItem, "key">) =>
    setLog((prev) => [...prev, { ...item, key: `i${counter.current++}` }]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 80);
    return () => clearInterval(t);
  }, [busy]);

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (trimmed === "/exit" || trimmed === "/quit") return exit();
    if (trimmed === "/clear") {
      setLog([]);
      return;
    }
    if (trimmed === "/help") {
      push({
        kind: "info",
        text: "Commands: /tools list tools · /clear reset transcript · /exit quit. Otherwise just describe a coding task.",
      });
      return;
    }
    if (trimmed === "/tools") {
      push({ kind: "info", text: "Tools: " + tools.map((t) => t.name).join(", ") });
      return;
    }

    push({ kind: "user", text: trimmed });
    setBusy(true);
    try {
      for await (const ev of agent.current!.run(trimmed)) {
        renderEvent(ev, push);
      }
    } catch (e) {
      push({ kind: "error", text: (e as Error).message, isError: true });
    } finally {
      setBusy(false);
    }
  };

  useInput((value, key) => {
    if (key.ctrl && value === "c") return exit();

    // Approval prompt takes over the keyboard.
    if (pending) {
      if (value.toLowerCase() === "y" || key.return) {
        pending.resolve(true);
        setPending(null);
      } else if (value.toLowerCase() === "n" || key.escape) {
        pending.resolve(false);
        setPending(null);
      }
      return;
    }

    if (busy) return;

    if (key.return) {
      const text = input;
      setInput("");
      void submit(text);
    } else if (key.backspace || key.delete) {
      setInput((q) => q.slice(0, -1));
    } else if (value && !key.ctrl && !key.meta) {
      setInput((q) => q + value);
    }
  });

  return (
    <Box flexDirection="column">
      <Static items={[{ key: "banner" }, ...log]}>
        {(item: any) =>
          item.key === "banner" ? (
            <Box key="banner" flexDirection="column" marginBottom={1}>
              <Text>{BANNER}</Text>
              <Text dimColor>
                {provider.name}:{provider.model} · {cwd}
                {context ? ` · context: ${context.filename}` : ""} · /help for commands
              </Text>
            </Box>
          ) : (
            <LogLine key={item.key} item={item as LogItem} />
          )
        }
      </Static>

      {busy && !pending && (
        <Box>
          <Text color="magenta">{SPINNER[frame]} </Text>
          <Text dimColor>working…</Text>
        </Box>
      )}

      {pending && (
        <Box flexDirection="column" marginY={1}>
          <Text color="yellow">⚠ Run mutating tool: </Text>
          <Text> {pending.label}</Text>
          <Text dimColor>Press y to allow, n to skip.</Text>
        </Box>
      )}

      {!busy && !pending && (
        <Box marginTop={1}>
          <Text color="magenta">❯ </Text>
          <Text>{input}</Text>
          <Text color="magenta">▌</Text>
        </Box>
      )}
    </Box>
  );
};

function renderEvent(ev: AgentEvent, push: (item: Omit<LogItem, "key">) => void) {
  switch (ev.type) {
    case "assistant_text":
      push({ kind: "assistant", text: ev.text });
      break;
    case "tool_call":
      push({ kind: "tool", text: formatToolCall(ev.name, ev.input) });
      break;
    case "tool_result":
      push({
        kind: "result",
        text: previewOutput(ev.output),
        isError: ev.isError,
      });
      break;
    case "tool_denied":
      push({ kind: "denied", text: `skipped ${ev.name}` });
      break;
    case "error":
      push({ kind: "error", text: ev.message, isError: true });
      break;
    // turn_complete carries the same text already shown via assistant_text
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
    case "assistant":
      return (
        <Box marginTop={1}>
          <Text>{item.text}</Text>
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
        <Box marginLeft={4} flexDirection="column">
          <Text color={item.isError ? "red" : "gray"}>{item.text}</Text>
        </Box>
      );
    case "denied":
      return <Text color="yellow">{"  "}✗ {item.text}</Text>;
    case "info":
      return <Text dimColor>{item.text}</Text>;
    case "error":
      return (
        <Box marginTop={1}>
          <Text color="red">✗ {item.text}</Text>
        </Box>
      );
  }
};
