/**
 * Output helper: one place that decides between human-readable text and stable
 * JSON, and that keeps stdout clean so `--json` stays pipeable.
 */

import type { Writable } from "node:stream";
import type { SendContent } from "@photon-ai/api";
import type { CliError } from "./errors.js";

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
} as const;

export interface OutputOptions {
  json?: boolean;
  color?: boolean;
  stdout?: Writable;
  stderr?: Writable;
}

export interface TableColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export interface Output {
  readonly json: boolean;
  data(value: unknown): void;
  line(text?: string): void;
  success(text: string): void;
  info(text: string): void;
  warn(text: string): void;
  error(cliError: CliError): void;
  table<T>(rows: T[], columns: Array<TableColumn<T>>): void;
  heading(text: string): void;
  keyValue(pairs: Array<[string, unknown]>): void;
}

export function createOutput({
  json = false,
  color = false,
  stdout = process.stdout,
  stderr = process.stderr,
}: OutputOptions = {}): Output {
  const paint = (code: string, text: string): string => (color ? `${code}${text}${ANSI.reset}` : text);

  return {
    json,

    /** Emits the machine-readable result; a no-op unless --json is set. */
    data(value: unknown): void {
      if (!json) return;
      stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    },

    line(text = ""): void {
      if (json) return;
      stdout.write(`${text}\n`);
    },

    success(text: string): void {
      if (json) return;
      stdout.write(`${paint(ANSI.green, "✓")} ${text}\n`);
    },

    info(text: string): void {
      if (json) return;
      stdout.write(`${paint(ANSI.dim, text)}\n`);
    },

    warn(text: string): void {
      if (json) return;
      stderr.write(`${paint(ANSI.yellow, "!")} ${text}\n`);
    },

    error(cliError: CliError): void {
      stderr.write(`${paint(ANSI.red, "✗")} ${cliError.message}\n`);
      if (cliError.hint) stderr.write(`  ${cliError.hint}\n`);
    },

    /** Simple two-column renderer used by the list commands. */
    table<T>(rows: T[], columns: Array<TableColumn<T>>): void {
      if (json) return;
      if (rows.length === 0) {
        this.info("(no results)");
        return;
      }
      const widths = columns.map((column) =>
        Math.max(column.header.length, ...rows.map((row) => String(column.value(row) ?? "").length)),
      );
      const header = columns.map((column, index) => column.header.padEnd(widths[index] ?? 0)).join("  ");
      stdout.write(`${paint(ANSI.bold, header)}\n`);
      for (const row of rows) {
        const cells = columns.map((column, index) =>
          String(column.value(row) ?? "").padEnd(widths[index] ?? 0),
        );
        stdout.write(`${cells.join("  ")}\n`);
      }
    },

    heading(text: string): void {
      if (json) return;
      stdout.write(`${paint(ANSI.bold, text)}\n`);
    },

    keyValue(pairs: Array<[string, unknown]>): void {
      if (json) return;
      const width = Math.max(...pairs.map(([key]) => key.length));
      for (const [key, value] of pairs) {
        stdout.write(`${paint(ANSI.dim, key.padEnd(width))}  ${String(value ?? "")}\n`);
      }
    },
  };
}

/** Formats an RFC 3339 timestamp for humans; falls back to the raw string. */
export function formatTime(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

/** Renders message content as a single line of text for tables and logs. */
export function summarizeContent(content: SendContent | undefined): string {
  if (!content) return "";
  switch (content.type) {
    case "text":
    case "text.update":
      return content.text;
    case "attachment":
      return `[attachment ${content.attachmentId}]`;
    case "voice":
      return "[voice note]";
    case "reaction":
      return `[reaction ${content.action ?? "add"} ${content.reaction}]`;
    case "poll":
    case "poll.update":
      return `[poll ${content.question}]`;
    case "poll.vote":
      return "[poll vote]";
    case "message.delete":
      return "[message deleted]";
    case "message.read":
      return "[read receipt]";
    case "space.typing.update":
      return `[typing ${content.typing ? "on" : "off"}]`;
    case "space.participants.update":
      return "[participants updated]";
    case "group":
      return `[group of ${content.parts.length}]`;
    default:
      return "[unknown content]";
  }
}
