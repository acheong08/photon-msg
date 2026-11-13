/**
 * Argument parsing built on node:util parseArgs, with a small routing layer for
 * two-word commands such as `messages list`.
 */

import { parseArgs } from "node:util";
import { usageError } from "./errors.js";

/** Options every command accepts. */
export const GLOBAL_OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  json: { type: "boolean" },
  color: { type: "boolean", allowNegative: true },
  "api-key": { type: "string" },
  project: { type: "string" },
  "base-url": { type: "string" },
  timeout: { type: "string" },
  "dry-run": { type: "boolean" },
  quiet: { type: "boolean", short: "q" },
};

/**
 * Parses arguments for one command.
 * @param {string[]} argv
 * @param {Record<string, {type: "string"|"boolean", short?: string, multiple?: boolean, allowNegative?: boolean, default?: unknown}>} options
 */
export function parseOptions(argv, options = {}) {
  try {
    return parseArgs({
      args: argv,
      options: { ...GLOBAL_OPTIONS, ...options },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw usageError(error.message.replace(/^TypeError: /, ""));
  }
}

/**
 * Splits argv into a command path and the remaining arguments, matching the
 * longest registered route first so `messages get` wins over a bare `messages`.
 * @param {string[]} argv
 * @param {Record<string, unknown>} routes
 */
export function route(argv, routes) {
  for (const size of [2, 1]) {
    const head = argv.slice(0, size);
    if (head.length !== size) continue;
    if (head.some((token) => token.startsWith("-"))) continue;
    const name = head.join(" ");
    if (Object.hasOwn(routes, name)) {
      return { name, rest: argv.slice(size), spec: routes[name] };
    }
  }
  return { name: null, rest: argv, spec: null };
}

/** True when the flag pair asks for help. */
export const wantsHelp = (values) => values.help === true;

/** Coerces a flag that may be given once or many times into an array. */
export const toArray = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
