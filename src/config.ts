import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type PermissionMode = "ask" | "auto" | "readonly";

export interface PokeCodeConfig {
  /** Poke V2 API key (Kitchen key). Never logged. */
  apiKey?: string;
  /** Override for the Poke API base URL. */
  baseUrl?: string;
  permissionMode?: PermissionMode;
}

export const CONFIG_DIR = join(homedir(), ".config", "poke-code");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const VALID_KEYS = ["apiKey", "baseUrl", "permissionMode"] as const;
export type ConfigKey = (typeof VALID_KEYS)[number];

function sanitize(raw: unknown): PokeCodeConfig {
  const out: PokeCodeConfig = {};
  if (typeof raw !== "object" || raw === null) return out;
  const c = raw as Record<string, unknown>;
  if (typeof c.apiKey === "string" && c.apiKey.length > 0) out.apiKey = c.apiKey;
  if (typeof c.baseUrl === "string" && c.baseUrl.length > 0) out.baseUrl = c.baseUrl;
  if (c.permissionMode === "ask" || c.permissionMode === "auto" || c.permissionMode === "readonly") {
    out.permissionMode = c.permissionMode;
  }
  return out;
}

export function loadConfig(): PokeCodeConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return sanitize(JSON.parse(readFileSync(CONFIG_PATH, "utf-8")));
    }
  } catch {
    // Corrupt or unreadable config -> treat as empty.
  }
  return {};
}

export function saveConfig(cfg: PokeCodeConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(sanitize(cfg), null, 2) + "\n", { mode: 0o600 });
}

export function setConfigValue(key: string, value: string): void {
  if (!(VALID_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
  }
  const cfg = loadConfig();
  (cfg as Record<string, string>)[key] = value;
  saveConfig(cfg);
}

export function getConfigValue(key: string): string | undefined {
  if (!(VALID_KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${VALID_KEYS.join(", ")}`);
  }
  const v = (loadConfig() as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

/** Redacted view for display: the key itself is never printed. */
export function redactConfig(cfg: PokeCodeConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg)) {
    out[k] =
      k === "apiKey" && typeof v === "string" && v.length > 4 ? `****${v.slice(-4)}` : String(v);
  }
  return out;
}

export function permissionModeOf(cfg: PokeCodeConfig): PermissionMode {
  return cfg.permissionMode ?? "ask";
}

/** Base URL for the Poke API: explicit config wins, then POKE_API env, then default. */
export function baseUrlOf(cfg: PokeCodeConfig): string {
  const raw = cfg.baseUrl ?? process.env.POKE_API ?? "https://poke.com/api/v1";
  return raw.replace(/\/+$/, "");
}
