/**
 * Programmatic entry point, so the CLI's building blocks can be reused in a
 * script or an agent without shelling out.
 */

export { createPhotonClient, createOfflineClient, pageItems, nextPageToken, handleOf } from "./client.js";
export type { ClientOptions } from "./client.js";

export { buildMessage, detectModes, describeContent, validateContentFlags, MODES } from "./content.js";
export type { BuildMessageInput, ContentMode } from "./content.js";

export { resolveTarget, resolveUser, normalizeHandle, inferPlatform } from "./target.js";
export type { ResolveTargetInput, ResolveUserInput } from "./target.js";

export { createUploader, buildMultipartRelated, contentTypeFor } from "./upload.js";
export type { UploaderOptions, MultipartInput } from "./upload.js";

export { resolveConfig, requireCredentials, readConfigFile, redact, ENV, defaultConfigPath } from "./config.js";
export type { Config, ConfigFile, Credentials, ResolveConfigInput } from "./config.js";

export { createOutput, formatTime, summarizeContent } from "./output.js";
export type { Output, OutputOptions, TableColumn } from "./output.js";

export { CliError, EXIT, PROBLEM_HINTS, toCliError, isApiError, errorPayload, usageError } from "./errors.js";
export type { CliErrorOptions, ExitCode, ProblemBody, ApiErrorLike } from "./errors.js";

export { main, ROUTES, commands, hasRoute } from "./cli.js";

export type {
  Flags,
  Command,
  CommandContext,
  BuiltMessage,
  EmailOptions,
  ResolvedTarget,
  Uploader,
  UserLookup,
  UserRecord,
  MessageRecord,
  SpaceRecord,
  AssignmentRecord,
  AttachmentRecord,
} from "./types.js";
