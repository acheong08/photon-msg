/**
 * Error types and exit codes.
 *
 * Every failure path in the CLI funnels through `CliError`, so callers always
 * get a stable `exitCode` plus an optional actionable `hint`.
 */

export const EXIT = {
  OK: 0,
  FAILURE: 1,
  USAGE: 2,
  AUTH: 3,
  NOT_FOUND: 4,
  FORBIDDEN: 5,
  CONFLICT: 6,
};

export class CliError extends Error {
  /**
   * @param {string} message Human-readable summary.
   * @param {{exitCode?: number, hint?: string, code?: string, details?: unknown}} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode ?? EXIT.FAILURE;
    this.hint = options.hint;
    this.code = options.code;
    this.details = options.details;
  }
}

/** Usage error: bad flags, missing required arguments. */
export const usageError = (message, hint) =>
  new CliError(message, { exitCode: EXIT.USAGE, hint, code: "USAGE" });

/**
 * Guidance for problem codes the API returns. The shared-line case is the one
 * that trips people up most often: a pooled line cannot open a conversation.
 */
export const PROBLEM_HINTS = {
  SHARED_LINE_INBOUND_REQUIRED:
    "This line is a pooled shared line, so it cannot message someone who has not written to it first. " +
    "Have the recipient send any message to the line, then reply inside that space. " +
    "For agent-initiated messages you need a purchased SMS number or a dedicated iMessage line.",
  SHARED_LINE_GROUP_UNSUPPORTED:
    "Pooled shared lines only carry direct conversations, not group chats.",
  NOT_AUTHENTICATED: "Set PHOTON_API_KEY to a project API key, or pass --api-key.",
  INSUFFICIENT_SCOPE:
    "The API key is missing a permission this call needs. Project keys need project:read / project:write; " +
    "line assignments also need platforms:read / platforms:write.",
  FORBIDDEN: "The key is valid but not allowed to touch this resource. Check the project ID and key scope.",
  PROJECT_NOT_SELECTED: "Set PHOTON_PROJECT_ID, or pass --project.",
  IDEMPOTENCY_KEY_REUSED:
    "That idempotency key was already used for a different request. Omit --idempotency-key to mint a new one.",
  VALIDATION_FAILED: "The API rejected the payload. Re-run with --json to see the full problem detail.",
  ATTACHMENT_NOT_READY: "The attachment is still processing. Retry after the server's Retry-After interval.",
  RATE_LIMITED: "Rate limited. Honor the Retry-After header instead of retrying immediately.",
  ATTACHMENT_TOO_LARGE: "The file exceeds the attachment size limit.",
  UNSUPPORTED_CONTENT: "This platform does not support that content type. Check the platform's feature support.",
};

const EXIT_BY_STATUS = {
  401: EXIT.AUTH,
  403: EXIT.FORBIDDEN,
  404: EXIT.NOT_FOUND,
  409: EXIT.CONFLICT,
  422: EXIT.USAGE,
  429: EXIT.FAILURE,
};

/**
 * True for `ApiError` instances from @photon-ai/api without importing the class
 * (duck-typed so tests can pass plain objects).
 */
export const isApiError = (error) =>
  Boolean(error) && typeof error.status === "number" && typeof error.message === "string";

/**
 * Normalizes anything thrown into a CliError.
 * @returns {CliError}
 */
export function toCliError(error) {
  if (error instanceof CliError) return error;

  if (isApiError(error)) {
    const problem = error.body ?? {};
    const code = problem.code ?? `HTTP_${error.status}`;
    const detail = problem.detail ?? problem.title ?? error.message;
    const exitCode = EXIT_BY_STATUS[error.status] ?? EXIT.FAILURE;
    return new CliError(`Photon API error ${error.status}: ${detail}`, {
      exitCode,
      code,
      hint: PROBLEM_HINTS[code],
      details: {
        code,
        status: error.status,
        requestId: problem.requestId,
        type: problem.type,
      },
    });
  }

  return new CliError(error instanceof Error ? error.message : String(error));
}

/** Serializes an error for `--json` output. */
export const errorPayload = (cliError) => ({
  error: {
    message: cliError.message,
    code: cliError.code,
    exitCode: cliError.exitCode,
    hint: cliError.hint ?? null,
    details: cliError.details ?? null,
  },
});
