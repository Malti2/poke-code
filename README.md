# poke-code

The electric terminal coding companion — an AI coding agent in your terminal, in the spirit of Claude Code, wired into [Poke](https://poke.com).

Built with [Bun](https://bun.sh), TypeScript, and [Ink](https://github.com/vadimdemedes/ink).

## What it does

poke-code has two complementary modes:

1. **Local coding agent** — an interactive (or headless) agent loop with file, search, and shell tools that reads, edits, and runs code on your machine.
2. **Poke tunnel** — exposes those same tools to your Poke agent over a secure tunnel, so the Poke assistant can do coding tasks on your machine via [MCP](https://modelcontextprotocol.io).

Both modes share one tool layer, so they always stay in sync.

## Install

```bash
bun install
```

## Use it as an interactive agent

The agent's brain is **your Poke agent** (poke.com) — no third‑party LLM keys. Authenticate first:

```bash
bun start login            # device-code login, or set POKE_API_KEY
```

Then start the agent:

```bash
bun start                       # interactive TUI
bun start -c                    # resume the most recent session in this dir
bun start -p "fix the bug in src/foo.ts and run the tests"   # headless, prints result
bun start run "summarise this repo"                          # same as -p
bun start -p "audit deps" --output-format json               # structured output for scripts
```

poke-code renders the task, the tool list, and the running transcript into a message to your Poke agent, asks it to choose the next tool (or give a final answer), then executes the tools locally and loops. In interactive mode, mutating tools (write/edit/bash) ask for confirmation. Pass `--no-confirm` to auto-approve. Type `/help` for commands. For multi-step work the agent keeps a live plan (an `update_plan` tool, like Claude Code's todo list). Conversations are saved under `~/.config/poke-code/sessions`; resume the latest with `-c` / `--continue`.

### Project context

Like Claude Code's `CLAUDE.md`, poke-code reads a project context file from the working directory and folds it into the system prompt. The first of these that exists wins: `POKE.md`, `AGENTS.md`, `CLAUDE.md`, `.pokecode.md`. Use it to record conventions, build commands, and gotchas.

## Connect your tools to Poke

```bash
bun start login          # authenticate (device-code flow, also reads POKE_API_KEY)
bun start tunnel         # start the local MCP server + tunnel it to Poke
```

`tunnel` starts a local MCP server and forwards it to Poke. Your Poke agent can then call the tools (`read_file`, `write_file`, `edit_file`, `list_files`, `glob`, `grep`, `execute_bash`) on your machine.

You can also run just the MCP server (e.g. to point the standalone `poke tunnel <url>` CLI at it, or to debug):

```bash
bun start serve --port 3000
```

## Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read a file with line numbers (supports offset/limit) |
| `write_file` | Create or overwrite a file |
| `edit_file` | Exact-string replacement in a file |
| `list_files` | List a directory |
| `glob` | Find files by glob pattern |
| `grep` | Search file contents by regex |
| `execute_bash` | Run a shell command (with timeout) |
| `update_plan` | Track a multi-step plan (local agent only) |

## Develop

```bash
bun test          # run the test suite
bun run typecheck # type-check with tsc
```

## How it fits together

```
            ┌─────────────────────────────┐
   Poke  ◀──│  Agent loop (src/agent)      │  interactive TUI / headless
  agent  ──▶│  PokeProvider · tools · loop │  (src/ui, src/runHeadless)
 (brain)    └──────────────┬──────────────┘
                           │ shared tool layer (src/tools)
            ┌──────────────┴──────────────┐
   Poke ◀───│  MCP server (src/mcp)        │◀── PokeTunnel (src/tunnel)
   agent    │  JSON-RPC 2.0 over HTTP      │
            └─────────────────────────────┘
```

Poke shows up twice: as the **brain** that drives the local loop (`PokeProvider`, via `sendMessage`), and as a **consumer** of your tools over the MCP tunnel.
