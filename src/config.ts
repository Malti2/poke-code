import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * poke-code keeps a tiny bit of local state (the last tunnel connection id, so
 * we can clean it up on the next run). Auth tokens are deliberately NOT stored
 * here — the `poke` SDK owns credentials in ~/.config/poke/credentials.json.
 */

export const CONFIG_DIR =
  process.env.POKE_CODE_CONFIG_DIR ?? join(homedir(), ".config", "poke-code");
const STATE_PATH = join(CONFIG_DIR, "state.json");

export interface State {
  connectionId?: string;
}

export function loadState(): State {
  try {
    if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
  } catch {
    // corrupt state is not worth crashing over
  }
  return {};
}

export function saveState(state: State): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Warning: could not persist poke-code state:", (e as Error).message);
  }
}
