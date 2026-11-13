import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveConfig, requireCredentials, redact } from "../src/config.js";
import { EXIT, PROBLEM_HINTS, toCliError, errorPayload, usageError, CliError } from "../src/errors.js";
import { route, parseOptions } from "../src/args.js";

test("flags win over environment and config file", () => {
  const config = resolveConfig({
    flags: { "api-key": "from-flag", project: "flag-project" },
    env: { PHOTON_API_KEY: "from-env", PHOTON_PROJECT_ID: "env-project" },
    file: { apiKey: "from-file" },
  });
  assert.equal(config.apiKey, "from-flag");
  assert.equal(config.projectId, "flag-project");
});

test("environment wins over the config file", () => {
  const config = resolveConfig({
    flags: {},
    env: { PHOTON_API_KEY: "from-env" },
    file: { apiKey: "from-file", projectId: "file-project" },
  });
  assert.equal(config.apiKey, "from-env");
  assert.equal(config.projectId, "file-project");
});

test("missing credentials raise a usage error naming both", () => {
  assert.throws(
    () => requireCredentials(resolveConfig({ flags: {}, env: {}, file: {} })),
    (error: unknown) =>
      error instanceof CliError &&
      error.exitCode === EXIT.USAGE &&
      /API key/.test(error.message) &&
      /project ID/.test(error.message),
  );
});

test("redact keeps a recognizable prefix and suffix", () => {
  assert.match(redact("pho_sk_0123456789abcdef"), /^pho_sk_0…cdef$/);
  assert.equal(redact(""), "");
  assert.equal(redact(undefined), "");
});

test("API errors map to exit codes and hints by status", () => {
  const unauthorized = toCliError({ status: 401, message: "nope", body: { code: "NOT_AUTHENTICATED" } });
  assert.equal(unauthorized.exitCode, EXIT.AUTH);
  assert.equal(unauthorized.hint, PROBLEM_HINTS.NOT_AUTHENTICATED);

  const forbidden = toCliError({
    status: 403,
    message: "no",
    body: { code: "SHARED_LINE_INBOUND_REQUIRED", detail: "x" },
  });
  assert.equal(forbidden.exitCode, EXIT.FORBIDDEN);
  assert.match(forbidden.hint ?? "", /cannot message someone who has not written/);

  const missing = toCliError({ status: 404, message: "gone", body: {} });
  assert.equal(missing.exitCode, EXIT.NOT_FOUND);
});

test("API errors carry request metadata for support", () => {
  const error = toCliError({
    status: 422,
    message: "bad",
    body: { code: "VALIDATION_FAILED", detail: "field x", requestId: "pho_req_1", type: "t" },
  });
  assert.deepEqual(error.details, {
    code: "VALIDATION_FAILED",
    status: 422,
    requestId: "pho_req_1",
    type: "t",
  });
  assert.match(error.message, /field x/);
});

test("non-API errors become plain failures", () => {
  const error = toCliError(new Error("boom"));
  assert.equal(error.exitCode, EXIT.FAILURE);
  assert.equal(error.message, "boom");
});

test("CliError instances pass through unchanged", () => {
  const original = usageError("bad flag", "try again");
  assert.equal(toCliError(original), original);
});

test("errorPayload is JSON-serializable", () => {
  const payload = errorPayload(usageError("bad", "hint"));
  assert.equal(JSON.parse(JSON.stringify(payload)).error.message, "bad");
});

const routes = {
  send: { options: { to: { type: "string" } } },
  "messages list": { options: { limit: { type: "string" } } },
} as const;

test("route prefers the longest match", () => {
  assert.equal(route(["messages", "list", "--limit", "5"], routes).name, "messages list");
  assert.equal(route(["send", "--to", "x"], routes).name, "send");
});

test("route returns null for unknown commands", () => {
  assert.equal(route(["bogus"], routes).name, null);
  assert.equal(route(["--json"], routes).name, null);
});

test("route leaves the remaining arguments intact", () => {
  const { rest } = route(["send", "--to", "x"], routes);
  assert.deepEqual(rest, ["--to", "x"]);
});

test("unknown options are reported as usage errors", () => {
  assert.throws(() => parseOptions(["--nope"], {}), (error: unknown) => error instanceof CliError && error.exitCode === EXIT.USAGE);
});

test("multiple string options collect into an array", () => {
  const { flags } = parseOptions(["--tag", "a", "--tag", "b"], { tag: { type: "string", multiple: true } });
  assert.deepEqual(flags.text, undefined);
  assert.deepEqual((flags as Record<string, unknown>).tag, ["a", "b"]);
});

test("--no-color is accepted even though parseArgs lacks allowNegative", () => {
  const { flags } = parseOptions(["--no-color"], {});
  assert.equal(flags.color, false);
});
