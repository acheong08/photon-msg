/**
 * Argument parsing built on node:util parseArgs, with a small routing layer for
 * two-word commands such as `messages list`.
 */

import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { usageError } from "./errors.js";
import type { Flags } from "./types.js";

/** Options every command accepts. */
export const GLOBAL_OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  json: { type: "boolean" },
  color: { type: "boolean" },
  "api-key": { type: "string" },
  project: { type: "string" },
  "base-url": { type: "string" },
  timeout: { type: "string" },
  "dry-run": { type: "boolean" },
  quiet: { type: "boolean", short: "q" },
} as const satisfies ParseArgsOptionsConfig;

export interface ParsedArguments {
  flags: Flags;
  positionals: string[];
}

/** Parses arguments for one command, merging in the global options. */
export function parseOptions(
  argv: string[],
  options: ParseArgsOptionsConfig = {},
): ParsedArguments {
  // `allowNegative` only exists from Node 22.4, and this package supports Node
  // 20, so `--no-color` is translated here instead of relying on it.
  const negated = argv.includes("--no-color");
  const args = negated ? argv.filter((token) => token !== "--no-color") : argv;

  try {
    const { values, positionals } = parseArgs({
      args,
      options: { ...GLOBAL_OPTIONS, ...options },
      allowPositionals: true,
      strict: true,
    });
    const flags = values as Flags;
    if (negated) flags.color = false;
    return { flags, positionals };
  } catch (error) {
    throw usageError((error as Error).message.replace(/^TypeError: /, ""));
  }
}

export interface RouteMatch<T> {
  name: keyof T | null;
  rest: string[];
  spec: T[keyof T] | null;
}

/**
 * Splits argv into a command path and the remaining arguments, matching the
 * longest registered route first so `messages get` wins over a bare `messages`.
 */
export function route<T extends Record<string, unknown>>(argv: string[], routes: T): RouteMatch<T> {
  for (const size of [2, 1]) {
    const head = argv.slice(0, size);
    if (head.length !== size) continue;
    if (head.some((token) => token.startsWith("-"))) continue;
    const name = head.join(" ");
    if (Object.hasOwn(routes, name)) {
      return {
        name: name as keyof T,
        rest: argv.slice(size),
        spec: routes[name] as T[keyof T],
      };
    }
  }
  return { name: null, rest: argv, spec: null };
}

/** True when the flag pair asks for help. */
export const wantsHelp = (flags: Flags): boolean => flags.help === true;

/** Coerces a flag that may be given once or many times into an array. */
export const toArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
