# poke-code

A terminal coding assistant powered by **Poke**. You type in a Claude Code-style
TUI; Poke's assistant does the thinking in the cloud and can run tools on your
machine — reading, editing, and searching your code, running shell commands —
asking your permission first.

## How it works

1. You send a message from the terminal (or via `--print`).
2. The message is delivered to Poke with a terminal-session instruction, and a
   local tunnel exposes your tools to Poke's assistant.
3. While Poke works, it calls your local tools (`read`, `write`, `edit`,
   `glob`, `grep`, `bash`, …). Write/shell operations trigger a permission
   prompt in your terminal.
4. Poke delivers its answer by calling the `reply_to_terminal` tool, which
   resolves your waiting query.

`sendMessage` only confirms delivery — the real answer always arrives through
the tunnel.

## Requirements

- [Bun](https://bun.sh) 1.4+
- A Poke V2 API key (Kitchen key) from https://poke.com/kitchen/api-keys

Works on macOS, Linux, and Windows. The `bash` tool uses the platform shell
(`bash` on macOS/Linux, `cmd.exe` on Windows); config and tunnel state live
in `~/.config/poke-code` on all platforms.

## Install

One command, everything automatic (installs Bun and git if missing, clones the
repo, runs `bun install`, links the `poke-code` binary onto your PATH):

**Windows** (PowerShell):

```powershell
powershell -c "irm https://raw.githubusercontent.com/Malti2/poke-code/main/scripts/install.ps1 | iex"
```

**macOS / Linux**:

```sh
curl -fsSL https://raw.githubusercontent.com/Malti2/poke-code/main/scripts/install.sh -o /tmp/pc-install.sh && sh /tmp/pc-install.sh
```

Prefer doing it by hand?

```sh
git clone https://github.com/Malti2/poke-code.git
cd poke-code
bun install
bun link   # puts `poke-code` on your PATH
```

Missing something later? `poke-code setup` re-checks dependencies and offers
to install what's missing (per OS).

## Configuration

On first start poke-code runs a short onboarding: paste your V2 API key
(input is hidden), it's validated and saved — no manual config needed.

```sh
# …or set it manually (written with 0600 permissions)
poke-code config set apiKey <your-v2-key>

# …or export it per-shell
export POKE_API_KEY=<your-v2-key>

# Inspect (the key is always redacted) / read / change values
poke-code config list
poke-code config get permissionMode
poke-code config set permissionMode ask   # ask | auto | readonly
```

Config lives in `~/.config/poke-code/config.json`. Keys are never logged.
`baseUrl` can override the Poke API endpoint (or set `POKE_API`).

| Key            | Meaning                                              |
| -------------- | ---------------------------------------------------- |
| `apiKey`       | Poke V2 API key                                      |
| `baseUrl`      | Poke API base URL (default `https://poke.com/api/v1`) |
| `permissionMode` | `ask` (default) · `auto` · `readonly`              |

## Usage

```sh
# Interactive TUI
poke-code
# or: bun start

# One-shot query (non-interactive; tools auto-approved unless readonly)
poke-code --print "explain what src/services/tunnel.ts does"

# Standalone tunnel (exposes local tools to Poke without the TUI)
poke-code tunnel [token]
```

### TUI

- Multiline input: `Enter` sends, `Alt+Enter` inserts a newline.
- While waiting: `Esc` aborts the wait (best effort — the message already
  reached Poke and can't be recalled).
- Tool calls render live as cards: spinner while running, `✓`/`✗` with
  duration when done; failed tools auto-expand their output.
- `Ctrl+C` quits.

### Slash commands

| Command   | Effect                                              |
| --------- | --------------------------------------------------- |
| `/help`   | Show help                                           |
| `/clear`   | Clear the transcript (also resets session approvals)|
| `/config` | Show current config (key redacted)                  |
| `/tools`  | List the tools exposed to Poke                      |
| `/tunnel` | Tunnel connection status                            |
| `/exit`   | Quit                                                |

### Permissions

When Poke requests a local `bash`, `write`, or `edit` call, a prompt appears:

- `1` Yes · `2` No · `3` Yes, don't ask again this session

Read-only tools (`read`, `glob`, `grep`, `list`, `webfetch`, `todo_*`) always
run without prompting. `readonly` mode denies all writes; `auto` approves
them silently.

## Project layout

```
src/
  main.tsx            CLI entry (TUI, --print, tunnel, config)
  agent/session.ts    AgentSession.ask(): send → wait for reply_to_terminal
  poke/client.ts      Poke API client (auth resolution, sendMessage)
  services/tunnel.ts  Tunnel lifecycle + tool-call entry point + events
  mcp/server.ts       Local MCP server (Streamable HTTP) that Poke's
                      assistant calls through the reverse tunnel
  tools/              Local tool registry (single source of truth)
    read.ts write.ts edit.ts list.ts glob.ts grep.ts
    bash.ts webfetch.ts todo.ts reply.ts manager.ts types.ts
  tui/                Ink components (App, ToolCard, markdown, …)
  config.ts           ~/.config/poke-code/config.json handling
test/
  poke-flow.test.ts   Headless flow test with a mocked Poke client
```

## Development

```sh
bun install          # install dependencies
bun run typecheck    # strict TypeScript check (must be clean)
bun test             # headless tests (mocked Poke client + real MCP round trip)
```

The interactive Ink UI can't be tested headlessly; the tests cover the
engine instead: `ask()` → tool-start/tool-end events → permission plumbing →
answer delivery, plus timeout and abort behavior. `test/mcp-server.test.ts`
spins up the real local MCP server and drives it with an MCP client
(`initialize` → `tools/list` → `tools/call`).

Live Poke answers require a real API key and can't be verified in CI — the
mocked test stands in for the transport.

## Privacy

No telemetry. The only network traffic is the Poke API itself (message
delivery, tunnel connection, tool sync). Your API key is stored locally with
`0600` permissions and never printed in full.
