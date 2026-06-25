# poke-code

Your **Poke** agent (poke.com), coding in your terminal. You describe a task; Poke does the work on your machine by calling poke-code's tools over a secure tunnel, and talks back to your terminal. There is **no third‑party LLM** — the brain is Poke.

Built with [Bun](https://bun.sh), TypeScript, and [Ink](https://github.com/vadimdemedes/ink).

## How it works

```
   you type a task
        │  queued locally
        ▼
  ┌───────────────┐                       ┌───────────────┐
  │   poke-code   │ ◀── get_user_message ─│   Poke agent  │
  │  (your shell) │ ───── the task ─────▶ │   (poke.com)  │
  │               │ ◀──── tools/call ──── │               │
  │  MCP server   │   read/edit/bash/…    │   the brain   │
  │   + tunnel    │ ───── results ──────▶ │               │
  └───────────────┘ ◀─ send_answer ────── └───────────────┘
        │
        ▼
  answers shown in your terminal
```

poke-code runs a local MCP server (the tools) and tunnels it to Poke. **Everything goes over that one tunnel — there is no outbound message API and no separate API key.** When you type a task it is queued locally; Poke receives it by calling the `get_user_message` tool, does the work by calling the other tools (read/edit/bash/…), and talks back by calling `send_answer`. That's the only thing you see in the terminal.

## Install

```bash
bun install
```

## Use it

```bash
bun start login            # authenticate with Poke (device-code; this is all you need)
bun start                  # connect the tunnel, then type tasks
```

Once connected, tell your Poke agent (in the Poke app) to use the **poke-code** connection — from then on it pulls the tasks you type and works on them, streaming tool calls and answers back into your terminal. Commands in the UI: `/clear`, `/help`, `/exit`.

> Authentication is just `poke login` (or `POKE_API_KEY`). That single credential is what the tunnel uses; nothing else is required.

## Tools exposed to Poke

| Tool | Description |
|------|-------------|
| `read_file` | Read a file with line numbers (offset/limit) |
| `write_file` | Create or overwrite a file |
| `edit_file` | Exact-string replacement in a file |
| `list_files` | List a directory |
| `glob` | Find files by glob pattern, sorted by most recently modified |
| `grep` | Search file contents by regex; optionally restrict files with a glob |
| `execute_bash` | Run a shell command (with timeout) |
| `update_plan` | Track a multi-step plan, shown in your terminal |
| `send_answer` | Show a message/result to you (set `final` when done) |
| `remember` | Save a durable note to project memory |
| `get_user_message` | How Poke receives the task you typed (over the tunnel) |

## Prompts & memory

- **Context files:** poke-code reads a `POKE.md` / `AGENTS.md` / `CLAUDE.md` / `.pokecode.md` from the working directory and includes it in the task it sends to Poke — use it for conventions, build commands, and gotchas.
- **Memory:** Poke can save durable notes with the `remember` tool. They're stored under `~/.config/poke-code/memory` (per directory) and folded into future tasks, so it remembers across sessions.

## Other commands

```bash
bun start -p "fix the failing test in src/foo.ts"   # headless: queue one task, stream the result
bun start run "summarise this repo" --output-format json
bun start tunnel           # just expose the tools to Poke (no task UI)
bun start serve --port 3000   # run the local MCP server only (debugging)
bun start whoami           # check auth
bun start logout           # clear stored Poke credentials
```

## Develop

```bash
bun test          # run the test suite
bun run typecheck # type-check with tsc
```
