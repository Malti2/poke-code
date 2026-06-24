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

The agent uses the Anthropic Messages API. Set a key first:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# optional: export ANTHROPIC_MODEL=claude-sonnet-4-5
```

Then start the agent:

```bash
bun start                       # interactive TUI
bun start -p "fix the bug in src/foo.ts and run the tests"   # headless, prints result
bun start run "summarise this repo"                          # same as -p
```

In interactive mode, mutating tools (write/edit/bash) ask for confirmation. Pass `--no-confirm` to auto-approve.

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

## Develop

```bash
bun test          # run the test suite
bun run typecheck # type-check with tsc
```

## How it fits together

```
            ┌─────────────────────────────┐
 ANTHROPIC  │  Agent loop (src/agent)      │  interactive TUI / headless
   API ◀────│  provider · tools · prompt   │  (src/ui, src/runHeadless)
            └──────────────┬──────────────┘
                           │ shared tool layer (src/tools)
            ┌──────────────┴──────────────┐
   Poke ◀───│  MCP server (src/mcp)        │◀── PokeTunnel (src/tunnel)
   agent    │  JSON-RPC 2.0 over HTTP      │
            └─────────────────────────────┘
```
