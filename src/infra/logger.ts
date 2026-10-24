import { invoke } from "@tauri-apps/api/core";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

const REDACTED = "[redacted]";
const MAX_DEPTH = 3;

/**
 * The keys whose text may be written: an identifier, a code, a kind. Any other
 * text held by a logged object may be a person's name, an SSN or an IBAN, and
 * the backend writes every line it receives to the log file (B44).
 */
const WRITABLE_TEXT_KEY = /^(id|.*(Id|_id)|code|kind|type|status|mode|version)$/;

/** The errors the runtime throws itself: their message describes code, never a person. */
const RUNTIME_ERRORS = new Set(["TypeError", "RangeError", "ReferenceError", "SyntaxError"]);

/**
 * An error as a log may write it. A runtime error keeps its message. Any other
 * error is one the application or a library built, and its message may quote
 * what the user typed or a record's name: only its kind is written.
 */
function describeError(error: Error): string {
  return RUNTIME_ERRORS.has(error.name) ? `${error.name}: ${error.message}` : error.name;
}

/** A logged object with every text it holds redacted, except under a writable key. */
function redact(value: unknown, key: string, depth: number): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return WRITABLE_TEXT_KEY.test(key) ? value : REDACTED;
  }
  if (value instanceof Error) {
    return describeError(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) {
      return REDACTED;
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k, depth + 1)]));
  }
  return value === undefined ? undefined : REDACTED;
}

/**
 * One line of text for a log call. A string argument is the message the
 * caller wrote; an object argument is data, written with its values redacted.
 *
 * Two things this cannot see, and that a caller must therefore never do: put a
 * value into the message itself (a second string argument, a template literal),
 * or log an object whose keys are values (a dictionary keyed by a name).
 */
function format(...args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return describeError(arg);
      }
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(redact(arg, "", 0));
        } catch {
          return "[Circular or Non-Serializable Object]";
        }
      }
      return String(arg);
    })
    .join(" ");
}

/**
 * A log call's arguments as the compiler accepts them: a text must be a literal
 * the caller wrote (a constant tag, a message), never a value computed at run
 * time, which could carry what the user typed (B44, #465). Data goes in an
 * object, whose texts `redact` hides.
 */
type LogArgs<T extends unknown[]> = {
  // `{}` fits a record keyed by `string` or by a template such as `id ${string}`,
  // never one keyed by literals only
  [K in keyof T]: T[K] extends string ? ({} extends Record<T[K], 1> ? never : T[K]) : T[K];
};

function createLogger(level: LogLevel) {
  return <const T extends unknown[]>(...args: LogArgs<T>): void => {
    const message = format(...args);
    const consoleMethod = level === "trace" ? "log" : level;
    console[consoleMethod](message);
    invoke("log_frontend", { level, message }).catch(() => {});
  };
}

export const logger = {
  trace: createLogger("trace"),
  debug: createLogger("debug"),
  info: createLogger("info"),
  warn: createLogger("warn"),
  error: createLogger("error"),
};
