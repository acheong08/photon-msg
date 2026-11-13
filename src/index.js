/**
 * Programmatic entry point, so the CLI's building blocks can be reused in a
 * script or an agent without shelling out.
 */

export { createPhotonClient, pageItems, handleOf } from "./client.js";
export { buildMessage, detectModes, describeContent, MODES } from "./content.js";
export { resolveTarget, resolveUser, normalizeHandle, inferPlatform } from "./target.js";
export { createUploader, buildMultipartRelated, contentTypeFor } from "./upload.js";
export { resolveConfig, requireCredentials, readConfigFile, redact, ENV } from "./config.js";
export { createOutput, formatTime, summarizeContent } from "./output.js";
export { CliError, EXIT, PROBLEM_HINTS, toCliError, isApiError } from "./errors.js";
export { main, ROUTES, commands } from "./cli.js";
