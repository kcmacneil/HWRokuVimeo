import { config } from "./config";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const TOKEN_PATTERNS = [/bearer\s+[a-z0-9._-]+/gi, /access_token=[^&\s]+/gi];

/** Strip anything that looks like a credential before it reaches a log sink. */
export function redact(input: string): string {
  let out = input;
  for (const re of TOKEN_PATTERNS) out = out.replace(re, "[redacted]");
  if (config.vimeoAccessToken) out = out.split(config.vimeoAccessToken).join("[redacted]");
  if (config.apiKey) out = out.split(config.apiKey).join("[redacted]");
  return out;
}

function write(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (order[level] < order[config.logLevel]) return;
  const line = { ts: new Date().toISOString(), level, msg, ...(meta ?? {}) };
  const text = redact(JSON.stringify(line));
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
