/**
 * Output helper: one place that decides between human-readable text and stable
 * JSON, and that keeps stdout clean so `--json` stays pipeable.
 */

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
};

/**
 * @param {{json?: boolean, color?: boolean, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream}} options
 */
export function createOutput({ json = false, color = false, stdout = process.stdout, stderr = process.stderr } = {}) {
  const paint = (code, text) => (color ? `${code}${text}${ANSI.reset}` : text);

  return {
    json,

    /** Emits the machine-readable result. Always JSON, even without --json, on --json. */
    data(value) {
      if (!json) return;
      stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    },

    line(text = "") {
      if (json) return;
      stdout.write(`${text}\n`);
    },

    success(text) {
      if (json) return;
      stdout.write(`${paint(ANSI.green, "✓")} ${text}\n`);
    },

    info(text) {
      if (json) return;
      stdout.write(`${paint(ANSI.dim, text)}\n`);
    },

    warn(text) {
      if (json) return;
      stderr.write(`${paint(ANSI.yellow, "!")} ${text}\n`);
    },

    error(cliError) {
      stderr.write(`${paint(ANSI.red, "✗")} ${cliError.message}\n`);
      if (cliError.hint) stderr.write(`  ${cliError.hint}\n`);
    },

    /** Simple two-column renderer used by the list commands. */
    table(rows, columns) {
      if (json) return;
      if (rows.length === 0) {
        this.info("(no results)");
        return;
      }
      const widths = columns.map((c) =>
        Math.max(c.header.length, ...rows.map((r) => String(c.value(r) ?? "").length)),
      );
      const header = columns.map((c, i) => c.header.padEnd(widths[i])).join("  ");
      stdout.write(`${paint(ANSI.bold, header)}\n`);
      for (const row of rows) {
        stdout.write(`${columns.map((c, i) => String(c.value(row) ?? "").padEnd(widths[i])).join("  ")}\n`);
      }
    },

    heading(text) {
      if (json) return;
      stdout.write(`${paint(ANSI.bold, text)}\n`);
    },

    keyValue(pairs) {
      if (json) return;
      const width = Math.max(...pairs.map(([k]) => k.length));
      for (const [key, value] of pairs) {
        stdout.write(`${paint(ANSI.dim, key.padEnd(width))}  ${value ?? ""}\n`);
      }
    },
  };
}

/** Formats an RFC 3339 timestamp for humans; falls back to the raw string. */
export function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

/** Renders message content as a single line of text for tables and logs. */
export function summarizeContent(content) {
  if (!content) return "";
  switch (content.type) {
    case "text":
    case "text.update":
      return content.text;
    case "attachment":
      return `[attachment ${content.attachmentId ?? ""}]`.trim();
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
      return `[group of ${content.parts?.length ?? 0}]`;
    default:
      return `[${content.type ?? "unknown"}]`;
  }
}
