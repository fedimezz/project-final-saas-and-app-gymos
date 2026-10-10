type Level = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const IS_PROD = process.env.NODE_ENV === "production";

function isEdgeRuntime(): boolean {
  try {
    return typeof (globalThis as Record<string, unknown>)["EdgeRuntime"] === "string";
  } catch {
    return false;
  }
}

function emit(level: Level, event: string, ctx: LogContext = {}) {
  const useJson = IS_PROD || process.env.JSON_LOGS === "1";

  const BLOCKED = new Set(["password", "token", "secret", "authorization", "cookie", "cardNumber"]);
  const safe: LogContext = {};
  for (const [k, v] of Object.entries(ctx)) {
    safe[k] = BLOCKED.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }

  const entry = {
    ts:      new Date().toISOString(),
    level,
    event,
    runtime: isEdgeRuntime() ? "edge" : "node",
    ...safe,
  };

  if (useJson) {
    const out = JSON.stringify(entry);
    if (level === "error" || level === "warn") console.error(out);
    else console.log(out);
  } else {
    const colour: Record<Level, string> = {
      debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m",
    };
    const reset  = "\x1b[0m";
    const prefix = `${colour[level]}[${level.toUpperCase()}]${reset} ${event}`;
    const extra  = Object.keys(safe).length ? " " + JSON.stringify(safe) : "";
    if (level === "error") console.error(`${prefix}${extra}`);
    else if (level === "warn") console.warn(`${prefix}${extra}`);
    else console.log(`${prefix}${extra}`);
  }
}

function debug(event: string, ctx?: LogContext) {
  if (IS_PROD && process.env.DEBUG !== "1") return;
  emit("debug", event, ctx);
}

export const log = {
  debug,
  info:  (event: string, ctx?: LogContext) => emit("info",  event, ctx),
  warn:  (event: string, ctx?: LogContext) => emit("warn",  event, ctx),
  error: (event: string, ctx?: LogContext) => emit("error", event, ctx),
};

export function withRequestLog<T extends (...args: Parameters<T>) => Promise<Response>>(
    event: string,
    handler: T
): T {
  return (async (...args: Parameters<T>): Promise<Response> => {
    const start = Date.now();
    try {
      const res = await handler(...args);
      log.info(event, { status: res.status, ms: Date.now() - start });
      return res;
    } catch (err) {
      log.error(event + "_unhandled", {
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - start,
      });
      throw err;
    }
  }) as T;
}