// Structured JSON logger. One line per event so log aggregators (Vercel,
// BetterStack, Datadog) can parse it without custom regex. To wire Sentry or
// a webhook later, hook into `emit` below — the call sites stay unchanged.

type Level = "debug" | "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

function emit(level: Level, scope: string, msg: string, fields?: LogFields) {
  const record = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(fields ?? {}),
  };
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logger(scope: string) {
  return {
    debug: (msg: string, fields?: LogFields) => emit("debug", scope, msg, fields),
    info: (msg: string, fields?: LogFields) => emit("info", scope, msg, fields),
    warn: (msg: string, fields?: LogFields) => emit("warn", scope, msg, fields),
    error: (msg: string, fields?: LogFields) => emit("error", scope, msg, fields),
  };
}
