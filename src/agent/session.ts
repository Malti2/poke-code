import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "../config";
import type { Message } from "./provider";

/**
 * Persists conversations to disk so `--continue` can resume them, like Claude
 * Code's session history. Each session is one JSON file; we pick the most
 * recently updated one for a given working directory.
 */

export interface Session {
  id: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  provider: string;
  model: string;
  messages: Message[];
}

function defaultDir(): string {
  return join(CONFIG_DIR, "sessions");
}

export class SessionStore {
  constructor(private readonly dir: string = defaultDir()) {}

  newSession(cwd: string, provider: string, model: string): Session {
    const now = new Date().toISOString();
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, cwd, createdAt: now, updatedAt: now, provider, model, messages: [] };
  }

  /** Most recently updated session for `cwd`, or null if there is none. */
  loadLatest(cwd: string): Session | null {
    if (!existsSync(this.dir)) return null;
    const candidates: Session[] = [];
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const s = JSON.parse(readFileSync(join(this.dir, file), "utf-8")) as Session;
        if (s.cwd === cwd && Array.isArray(s.messages)) candidates.push(s);
      } catch {
        // skip corrupt files
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return candidates[0];
  }

  save(session: Session): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    session.updatedAt = new Date().toISOString();
    writeFileSync(join(this.dir, `${session.id}.json`), JSON.stringify(session, null, 2));
  }
}
