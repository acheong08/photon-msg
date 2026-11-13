import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/photon-msg.js", import.meta.url));

/**
 * Runs the real binary in a child process with a scrubbed environment, so these
 * tests never touch a developer's real credentials.
 */
const run = (args, env = {}) => {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("PHOTON_")),
  );
  const result = spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    env: { ...cleanEnv, NO_COLOR: "1", ...env },
    timeout: 20_000,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

test("--version prints the package version", () => {
  const { code, stdout } = run(["--version"]);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("--help prints usage", () => {
  const { code, stdout } = run(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /USAGE/);
  assert.match(stdout, /photon-msg send/);
});

test("no arguments prints help", () => {
  const { code, stdout } = run([]);
  assert.equal(code, 0);
  assert.match(stdout, /COMMANDS/);
});

test("an unknown command exits with the usage code", () => {
  const { code, stderr } = run(["bogus"]);
  assert.equal(code, 2);
  assert.match(stderr, /Unknown command/);
});

test("a command help flag prints that command's help", () => {
  const { code, stdout } = run(["send", "--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /DESTINATION/);
});

test("a missing API key fails with the usage code and a hint", () => {
  const { code, stderr } = run(["messages", "list"]);
  assert.equal(code, 2);
  assert.match(stderr, /API key/);
  assert.match(stderr, /project api-key create/);
});

test("dry-run never requires credentials", () => {
  const { code, stdout } = run([
    "send",
    "--space",
    "pho_spc_test",
    "--as",
    "pho_usr_test",
    "--text",
    "hi",
    "--dry-run",
    "--json",
  ]);
  assert.equal(code, 0);
  const payload = JSON.parse(stdout);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.request.content.text, "hi");
});

test("dry-run refuses attachments rather than uploading", () => {
  const { code, stderr } = run([
    "send",
    "--space",
    "pho_spc_test",
    "--as",
    "pho_usr_test",
    "--image",
    "test/fixtures/pixel.png",
    "--dry-run",
  ]);
  assert.equal(code, 2);
  assert.match(stderr, /cannot include attachments/);
});

test("dry-run is rejected for read-only commands", () => {
  const { code, stderr } = run(["messages", "list", "--dry-run"]);
  assert.equal(code, 2);
  assert.match(stderr, /not supported/);
});

test("conflicting content flags are rejected before any network call", () => {
  const { code, stderr } = run([
    "send",
    "--space",
    "pho_spc_test",
    "--as",
    "pho_usr_test",
    "--text",
    "a",
    "--poll",
    "b",
  ]);
  assert.equal(2, code);
  assert.match(stderr, /Conflicting content flags/);
});
