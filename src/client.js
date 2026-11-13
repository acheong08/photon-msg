/**
 * Photon client construction. Kept in its own module so tests can build a
 * client against a stubbed fetch, and so the rest of the CLI never touches the
 * SDK constructor directly.
 */

import { Photon } from "@photon-ai/api";
import { CliError } from "./errors.js";

/**
 * @param {{apiKey: string, baseUrl?: string, timeoutMs?: number, fetch?: typeof globalThis.fetch}} options
 * @returns {Photon}
 */
export function createPhotonClient({ apiKey, baseUrl, timeoutMs, fetch }) {
  if (!apiKey) {
    throw new CliError("An API key is required to build a client.", {
      exitCode: 3,
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
 * Extract the list carried by a paged SDK response.
 *
 * Most paged endpoints use `items`, but a few (shared-line assignments, for
 * example) return a differently named array, so fall back to the first array
 * property rather than silently reporting zero results.
 */
export function pageItems(page) {
  if (!page || typeof page !== "object") return [];
  if (Array.isArray(page.items)) return page.items;
  if (Array.isArray(page.assignments)) return page.assignments;
  for (const value of Object.values(page)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

/** Convenience accessor that tolerates slightly different snapshot shapes. */
export const handleOf = (user) => user?.handle ?? user?.address ?? "";
