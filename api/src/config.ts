export interface Config {
  vimeoAccessToken: string;
  vimeoUserId: string | null;
  apiKey: string | null;
  cacheTtlSeconds: number;
  pageSize: number;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const level = env.LOG_LEVEL;
  return {
    vimeoAccessToken: (env.VIMEO_ACCESS_TOKEN ?? "").trim(),
    vimeoUserId: env.VIMEO_USER_ID?.trim() || null,
    apiKey: env.API_KEY?.trim() || null,
    cacheTtlSeconds: intEnv("CACHE_TTL_SECONDS", 300, 0, 86400),
    pageSize: intEnv("PAGE_SIZE", 50, 1, 100),
    port: intEnv("PORT", 3000, 1, 65535),
    logLevel:
      level === "debug" || level === "warn" || level === "error" ? level : "info",
  };
}

export const config: Config = loadConfig();
