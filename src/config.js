/**
 * Configuration resolution: flags beat environment variables, which beat a
 * config file. Nothing here reads secrets from the network.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { usageError } from "./errors.js";

export const ENV = {
  apiKey: "PHOTON_API_KEY",
  projectId: "PHOTON_PROJECT_ID",
  baseUrl: "PHOTON_API_BASE_URL",
  agentHandle: "PHOTON_AGENT_HANDLE",
};

/**
 * Reads `~/.config/photon-msg/config.json` when present. Any problem is
 * non-fatal: a missing file just yields an empty object.
 * @param {string} [path]
 */
export function readConfigFile(path = join(homedir(), ".config", "photon-msg", "config.json")) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    throw usageError(`Config file ${path} is not valid JSON: ${error.message}`);
  }
}

/**
 * @param {{flags: Record<string, unknown>, env?: NodeJS.ProcessEnv, file?: Record<string, unknown>}} input
 */
export function resolveConfig({ flags, env = process.env, file = readConfigFile() }) {
  const pick = (flagKey, envKey, fileKey) =>
    flags[flagKey] ?? (envKey ? env[envKey] : undefined) ?? (fileKey ? file[fileKey] : undefined);

  return {
    apiKey: pick("api-key", ENV.apiKey, "apiKey"),
    projectId: pick("project", ENV.projectId, "projectId"),
    baseUrl: pick("base-url", ENV.baseUrl, "baseUrl"),
    agentHandle: pick("agent", ENV.agentHandle, "agentHandle"),
    timeoutMs: flags["timeout"] ? Number(flags.timeout) : undefined,
  };
}

/** Throws a usage error when credentials are missing. */
export function requireCredentials(config) {
  const missing = [];
  if (!config.apiKey) missing.push(`an API key (--api-key, ${ENV.apiKey}, or config file)`);
  if (!config.projectId) missing.push(`a project ID (--project, ${ENV.projectId}, or config file)`);
  if (missing.length > 0) {
    throw usageError(`Missing ${missing.join(" and ")}.`, "Create a project key with: photon project api-key create --name cli --permission project:read --permission project:write");
  }
  return config;
}

/** Redacts a secret for logs and JSON output. */
export const redact = (value) =>
  typeof value === "string" && value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value ? "***" : "";
