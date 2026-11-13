/**
 * Configuration resolution: flags beat environment variables, which beat a
 * config file. Nothing here reads secrets from the network.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { usageError } from "./errors.js";
import type { Flags } from "./types.js";

export const ENV = {
  apiKey: "PHOTON_API_KEY",
  projectId: "PHOTON_PROJECT_ID",
  baseUrl: "PHOTON_API_BASE_URL",
  agentHandle: "PHOTON_AGENT_HANDLE",
} as const;

export interface Config {
  apiKey?: string;
  projectId?: string;
  baseUrl?: string;
  agentHandle?: string;
  timeoutMs?: number;
}

/** Config file shape, all fields optional. */
export interface ConfigFile {
  apiKey?: string;
  projectId?: string;
  baseUrl?: string;
  agentHandle?: string;
}

export const defaultConfigPath = (): string =>
  join(homedir(), ".config", "photon-msg", "config.json");

/**
 * Reads the config file when present. A missing file is not an error; malformed
 * JSON is.
 */
export function readConfigFile(path: string = defaultConfigPath()): ConfigFile {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as ConfigFile) : {};
  } catch (error) {
    throw usageError(`Config file ${path} is not valid JSON: ${(error as Error).message}`);
  }
}

export interface ResolveConfigInput {
  flags: Flags;
  env?: NodeJS.ProcessEnv;
  file?: ConfigFile;
}

export function resolveConfig({ flags, env = process.env, file = readConfigFile() }: ResolveConfigInput): Config {
  const pick = (
    flagKey: keyof Flags | undefined,
    envKey?: string,
    fileKey?: keyof ConfigFile,
  ): string | undefined => {
    const fromFlag = flagKey ? flags[flagKey] : undefined;
    if (typeof fromFlag === "string" && fromFlag.length > 0) return fromFlag;
    if (envKey) {
      const fromEnv = env[envKey];
      if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
    }
    if (fileKey) {
      const fromFile = file[fileKey];
      if (typeof fromFile === "string" && fromFile.length > 0) return fromFile;
    }
    return undefined;
  };

  const timeout = flags.timeout;
  return {
    apiKey: pick("api-key", ENV.apiKey, "apiKey"),
    projectId: pick("project", ENV.projectId, "projectId"),
    baseUrl: pick("base-url", ENV.baseUrl, "baseUrl"),
    // --as is per-command; the default sender comes from env or the config file.
    agentHandle: pick(undefined, ENV.agentHandle, "agentHandle"),
    ...(timeout !== undefined && Number.isFinite(Number(timeout)) ? { timeoutMs: Number(timeout) } : {}),
  };
}

/** A config with the credentials guaranteed present. */
export interface Credentials extends Config {
  apiKey: string;
  projectId: string;
}

/** Throws a usage error when credentials are missing. */
export function requireCredentials(config: Config): Credentials {
  const missing: string[] = [];
  if (!config.apiKey) missing.push(`an API key (--api-key, ${ENV.apiKey}, or config file)`);
  if (!config.projectId) missing.push(`a project ID (--project, ${ENV.projectId}, or config file)`);
  if (missing.length > 0) {
    throw usageError(
      `Missing ${missing.join(" and ")}.`,
      "Create a project key with: photon project api-key create --name cli --permission project:read --permission project:write",
    );
  }
  return config as Credentials;
}

/** Redacts a secret for logs and JSON output. */
export const redact = (value: string | undefined): string =>
  typeof value === "string" && value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value ? "***" : "";
