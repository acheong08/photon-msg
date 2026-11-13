/**
 * Photon client construction, kept in its own module so the rest of the CLI
 * never touches the SDK constructor directly and tests can build a client
 * against a stubbed fetch.
 */

import { Photon } from "@photon-ai/api";
import { CliError, EXIT, usageError } from "./errors.js";
import type { UserRecord } from "./types.js";

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export function createPhotonClient({ apiKey, baseUrl, timeoutMs, fetch }: ClientOptions): Photon {
  if (!apiKey) {
    throw new CliError("An API key is required to build a client.", {
      exitCode: EXIT.AUTH,
      hint: "Set PHOTON_API_KEY or pass --api-key.",
    });
  }

  return new Photon({
    headers: { Authorization: `Bearer ${apiKey}` },
    ...(baseUrl ? { baseUrl } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(fetch ? { fetch } : {}),
  });
}

/**
 * A client stand-in for `--dry-run`: every use throws, so an offline command
 * cannot accidentally reach the network.
 */
export function createOfflineClient(): Photon {
  const fail = (): never => {
    throw usageError("--dry-run is offline: this command must not contact the API.");
  };
  return new Proxy({} as Photon, {
    get: fail,
    has: fail,
    apply: fail,
  });
}

/**
 * Extract the list carried by a paged response.
 *
 * Most endpoints use `items`, but a few (shared-line assignments, for example)
 * name the array differently, so fall back to the first array property rather
 * than silently reporting zero results.
 */
export function pageItems<T>(page: unknown): T[] {
  if (!page || typeof page !== "object") return [];
  const record = page as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items as T[];
  if (Array.isArray(record.assignments)) return record.assignments as T[];
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

/** Convenience accessor that tolerates slightly different snapshot shapes. */
export const handleOf = (user: { handle?: string; address?: string } | null | undefined): string =>
  user?.handle ?? user?.address ?? "";

/** Reads a paged response's continuation token, whatever the endpoint calls it. */
export const nextPageToken = (page: unknown): string | undefined => {
  if (!page || typeof page !== "object") return undefined;
  const token = (page as { nextPageToken?: unknown }).nextPageToken;
  return typeof token === "string" ? token : undefined;
};

/** Narrows an SDK user to the fields the CLI displays. */
export const asUserRecord = (user: unknown): UserRecord => user as UserRecord;
