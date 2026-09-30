import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { theme } from "./theme";
import { Header, StatusBar } from "./components/Chrome";
import { AssistantMessage, ErrorMessage, SystemMessage, UserMessage } from "./components/Messages";
import { formatToolCall, ToolCard, type ToolEntry } from "./components/ToolCard";
import { InputBox } from "./components/InputBox";
import { filterSlashCommands, SlashMenu, SLASH_COMMANDS } from "./components/SlashMenu";
import { PermissionPrompt, type PendingPermission } from "./components/PermissionPrompt";
import { TunnelService, type PermissionDecision } from "../services/tunnel";
import { AgentSession } from "../agent/session";
import { PokeClient } from "../poke/client";
import { loadConfig, permissionModeOf, redactConfig } from "../config";

type Entry =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "tool"; entry: ToolEntry }
  | { kind: "system"; id: string; text: string }
  | { kind: "error"; id: string; text: string };

interface PendingPermissionState extends PendingPermission {
  resolve: (d: PermissionDecision) => void;
}

let idCounter = 0;
const uid = () => `e${++idCounter}`;

function summarizeArgs(toolName: string, args: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  if (toolName === "bash") return String(args.command ?? "");
  if (toolName === "write" || toolName === "edit") return String(args.path ?? "");
  const json = JSON.stringify(args);
  return json.length > 160 ? json.slice(0, 160) + "…" : json;
}

const HELP_TEXT = [
  "Commands:",
  ...SLASH_COMMANDS.map((c) => `  ${c.name} — ${c.description}`),
  "",
  "Keys: Enter send · Alt+Enter newline · Esc abort/wait · 1/2/3 answer permission prompts · Ctrl+C quit",
].join("\n");

export function App() {
  const { exit } = useApp();
  const [entries, setEntries] = useState<Entry[]>([
    {
      kind: "system",
      id: uid(),
      text: "Ask anything. Poke processes it in the cloud and can run tools on this machine (with your permission).",
    },
  ]);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [waitSecs, setWaitSecs] = useState(0);
  const [pendingPermission, setPendingPermission] = useState<PendingPermissionState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [connected, setConnected] = useState(false);

  const { tunnel, session } = useMemo(() => {
    const t = new TunnelService();
    return { tunnel: t, session: new AgentSession(t, new PokeClient()) };
  }, []);
  const abortRef = useRef<AbortController | null>(null);

  const pushEntry = useCallback((e: Entry) => {
    setEntries((prev) => [...prev, e]);
  }, []);

  // Wire tunnel events + permission handler once.
  useEffect(() => {
    const off = tunnel.onToolEvent((ev) => {
      if (ev.type === "tool-start") {
        const entry: ToolEntry = {
          id: uid(),
          name: ev.name,
          label: formatToolCall(ev.name, ev.args),
          status: "running",
          output: "",
          ms: 0,
        };
        setEntries((prev) => [...prev, { kind: "tool", entry }]);
      } else {
        setEntries((prev) => {
          const idx = prev.findIndex(
            (e) => e.kind === "tool" && e.entry.name === ev.name && e.entry.status === "running",
          );
          if (idx < 0) return prev;
          const next = [...prev];
          const old = (next[idx] as { kind: "tool"; entry: ToolEntry }).entry;
          next[idx] = {
            kind: "tool",
            entry: {
              ...old,
              status: ev.isError ? "error" : "done",
              output: ev.output ?? "",
              ms: ev.ms ?? 0,
            },
          };
          return next;
        });
      }
    });

    tunnel.setPermissionHandler(({ tool, args }) => {
      return new Promise<PermissionDecision>((resolve) => {
        setPendingPermission({
          toolName: tool.name,
          summary: formatToolCall(tool.name, args),
          detail: summarizeArgs(tool.name, args),
          resolve,
        });
      });
    });

    const timer = setInterval(() => setConnected(tunnel.isConnected), 2000);
    return () => {
      clearInterval(timer);
      off();
    };
  }, [tunnel]);

  // Waiting elapsed-time ticker.
  useEffect(() => {
    if (!waiting) {
      setWaitSecs(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setWaitSecs(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [waiting]);

  const runSlash = useCallback(
    (cmd: string) => {
      const [name] = cmd.split(/\s+/);
      switch (name) {
        case "/help":
          pushEntry({ kind: "system", id: uid(), text: HELP_TEXT });
          break;
        case "/clear":
          setEntries([]);
          tunnel.clearSessionPermissions();
          break;
        case "/config": {
          const cfg = redactConfig(loadConfig());
          const lines = Object.entries(cfg).map(([k, v]) => `  ${k}: ${v}`);
          pushEntry({
            kind: "system",
            id: uid(),
            text: lines.length ? `Config:\n${lines.join("\n")}` : "Config is empty. Run: poke-code config set apiKey <V2-key>",
          });
          break;
        }
        case "/tools": {
          const tools = tunnel.listTools();
          pushEntry({
            kind: "system",
            id: uid(),
            text: `Available tools (${tools.length}):\n${tools.map((t) => `  ${t.name} — ${t.description}`).join("\n")}`,
          });
          break;
        }
        case "/tunnel":
          pushEntry({
            kind: "system",
            id: uid(),
            text: tunnel.isConnected ? "Tunnel is connected." : "Tunnel is not connected yet (connects on first query).",
          });
          break;
        case "/exit":
          void tunnel.stop().finally(() => exit());
          break;
        default:
          pushEntry({ kind: "error", id: uid(), text: `Unknown command "${name}". Try /help.` });
      }
    },
    [pushEntry, tunnel, exit],
  );

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || waiting || pendingPermission) return;
      if (trimmed.startsWith("/")) {
        pushEntry({ kind: "user", id: uid(), text: trimmed });
        runSlash(trimmed);
        setInput("");
        setCursor(0);
        setSlashIndex(0);
        return;
      }
      pushEntry({ kind: "user", id: uid(), text: trimmed });
      setInput("");
      setCursor(0);
      setWaiting(true);
      const controller = new AbortController();
      abortRef.current = controller;
      void (async () => {
        try {
          const answer = await session.ask(trimmed, { signal: controller.signal });
          pushEntry({ kind: "assistant", id: uid(), text: answer });
          setConnected(tunnel.isConnected);
        } catch (e) {
          pushEntry({
            kind: "error",
            id: uid(),
            text: e instanceof Error ? e.message : String(e),
          });
        } finally {
          setWaiting(false);
          abortRef.current = null;
        }
      })();
    },
    [waiting, pendingPermission, pushEntry, runSlash, session, tunnel],
  );

  const insertText = useCallback(
    (t: string) => {
      setInput((prev) => {
        const next = prev.slice(0, cursor) + t + prev.slice(cursor);
        return next;
      });
      setCursor((c) => c + t.length);
    },
    [cursor],
  );

  const slashOpen =
    !waiting &&
    !pendingPermission &&
    input.startsWith("/") &&
    !input.includes("\n") &&
    filterSlashCommands(input).length > 0;
  const slashMatches = slashOpen ? filterSlashCommands(input) : [];

  useInput((ch, key) => {
    // Permission prompt has top priority.
    if (pendingPermission) {
      if (ch === "1") {
        pendingPermission.resolve("allow");
        setPendingPermission(null);
      } else if (ch === "2" || key.escape) {
        pendingPermission.resolve("deny");
        setPendingPermission(null);
      } else if (ch === "3") {
        pendingPermission.resolve("allow-session");
        setPendingPermission(null);
      }
      return;
    }

    if (key.ctrl && ch === "c") {
      void tunnel.stop().finally(() => exit());
      return;
    }

    // While waiting, only Esc (abort) is honored.
    if (waiting) {
      if (key.escape) {
        abortRef.current?.abort();
      }
      return;
    }

    // Slash menu navigation.
    if (slashOpen) {
      if (key.downArrow) {
        setSlashIndex((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (key.upArrow) {
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (key.tab || key.return) {
        const chosen = slashMatches[slashIndex] ?? slashMatches[0];
        if (chosen) {
          setInput(chosen.name + " ");
          setCursor(chosen.name.length + 1);
          setSlashIndex(0);
        }
        return;
      }
      if (key.escape) {
        setInput("");
        setCursor(0);
        return;
      }
    }

    if (key.return) {
      if (key.meta) {
        insertText("\n");
      } else {
        submit(input);
      }
      return;
    }
    if (key.escape) {
      return;
    }
    if (key.backspace) {
      if (cursor > 0) {
        setInput((prev) => prev.slice(0, cursor - 1) + prev.slice(cursor));
        setCursor((c) => c - 1);
      }
      return;
    }
    if (key.delete) {
      setInput((prev) => prev.slice(0, cursor) + prev.slice(cursor + 1));
      return;
    }
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(input.length, c + 1));
      return;
    }
    if (key.upArrow || key.downArrow) {
      // Move cursor across wrapped lines: approximate with line jumps.
      const lines = input.split("\n");
      let remaining = cursor;
      let lineIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (remaining <= lines[i].length) {
          lineIdx = i;
          break;
        }
        remaining -= lines[i].length + 1;
        lineIdx = i + 1;
      }
      const col = remaining;
      const target = key.upArrow ? lineIdx - 1 : lineIdx + 1;
      if (target >= 0 && target < lines.length) {
        const newCol = Math.min(col, lines[target].length);
        let pos = 0;
        for (let i = 0; i < target; i++) pos += lines[i].length + 1;
        setCursor(pos + newCol);
      }
      return;
    }
    if (ch && !key.ctrl && !key.meta) {
      insertText(ch);
      if (input.startsWith("/")) setSlashIndex(0);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Header cwd={process.cwd()} />
      <Box flexDirection="column" flexGrow={1}>
        {entries.map((e) => {
          switch (e.kind) {
            case "user":
              return <UserMessage key={e.id} text={e.text} />;
            case "assistant":
              return <AssistantMessage key={e.id} text={e.text} />;
            case "system":
              return <SystemMessage key={e.id} text={e.text} />;
            case "error":
              return <ErrorMessage key={e.id} text={e.text} />;
            case "tool":
              return (
                <ToolCard
                  key={e.entry.id}
                  entry={e.entry}
                  expanded={e.entry.status === "error"}
                />
              );
          }
        })}
      </Box>
      {pendingPermission && <PermissionPrompt pending={pendingPermission} />}
      {slashOpen && <SlashMenu commands={slashMatches} selected={slashIndex} />}
      <InputBox value={input} cursor={cursor} waiting={waiting} waitingSecs={waitSecs} />
      <StatusBar connected={connected} permissionMode={permissionModeOf(loadConfig())} />
      <Text color={theme.faint}> </Text>
    </Box>
  );
}
