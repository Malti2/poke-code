# poke-code

Your **Poke** agent (poke.com), coding in your terminal. You describe a task; Poke does the work on your machine by calling poke-code's tools over a secure tunnel, and talks back to your terminal. There is **no third‑party LLM** — the brain is Poke.

Built with [Bun](https://bun.sh), TypeScript, and [Ink](https://github.com/vadimdemedes/ink).

## How it works

```
   you type a task
        │
        ▼
  ┌───────────────┐   sendMessage(task)   ┌───────────────┐
  │   poke-code   │ ────────────────────▶ │   Poke agent  │
  │  (your shell) │                       │   (poke.com)  │
  │               │ ◀──── tools/call ──── │               │
  │  MCP server   │   read/edit/bash/…    │   the brain   │
  │   + tunnel    │ ───── results ──────▶ │               │
  └───────────────┘ ◀─ send_answer ────── └───────────────┘
        │
        ▼
  answers shown in your terminal
```

poke-code runs a local MCP server (the tools) and tunnels it to Poke. When you enter a task it is sent to your Poke agent, which then **drives the whole loop**: it reads and edits files, runs commands, and keeps a plan — all by calling tools over the tunnel. Poke shows you progress and results by calling the `send_answer` tool; that's the only thing you see in the terminal.

## Install

```bash
bun install
```

## Use it

```bash
bun start login            # authenticate with Poke (or set POKE_API_KEY)
bun start                  # interactive: type tasks, watch Poke work
bun start -p "fix the failing test in src/foo.ts"   # headless, one task
bun start run "summarise this repo" --output-format json
```

In the interactive UI you type a task and watch Poke's tool calls and answers stream in. Commands: `/clear`, `/help`, `/exit`.

## Tools exposed to Poke

| Tool | Description |
|------|-------------|
| `read_file` | Read a file with line numbers (offset/limit) |
| `write_file` | Create or overwrite a file |
| `edit_file` | Exact-string replacement in a file |
| `list_files` | List a directory |
| `glob` | Find files by glob pattern |
| `grep` | Search file contents by regex |
| `execute_bash` | Run a shell command (with timeout) |
| `update_plan` | Track a multi-step plan, shown in your terminal |
| `send_answer` | Show a message/result to you (set `final` when done) |
| `remember` | Save a durable note to project memory |

## Prompts & memory

- **Context files:** poke-code reads a `POKE.md` / `AGENTS.md` / `CLAUDE.md` / `.pokecode.md` from the working directory and includes it in the task it sends to Poke — use it for conventions, build commands, and gotchas.
- **Memory:** Poke can save durable notes with the `remember` tool. They're stored under `~/.config/poke-code/memory` (per directory) and folded into future tasks, so it remembers across sessions.

## Other commands

```bash
bun start tunnel           # just expose the tools to Poke (no task loop)
bun start serve --port 3000   # run the local MCP server only (debugging)
bun start whoami           # check auth
```

## Develop

```bash
bun test          # run the test suite
bun run typecheck # type-check with tsc
```
