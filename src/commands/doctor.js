/**
 * `doctor` — verifies credentials and project wiring before you send anything.
 *
 * Every check is read-only, so running it never mutates state.
 */

import { CliError } from "../errors.js";
import { redact } from "../config.js";
import { pageItems } from "../client.js";

export const options = {};

export async function run(ctx) {
  const { client, projectId, config, out, flags } = ctx;
  const checks = [];

  checks.push({ name: "api key", ok: Boolean(config.apiKey), detail: redact(config.apiKey) });
  checks.push({ name: "project id", ok: Boolean(projectId), detail: projectId ?? "" });
  checks.push({ name: "base url", ok: true, detail: config.baseUrl ?? "https://api.photon.codes (default)" });
  checks.push({ name: "agent handle", ok: Boolean(config.agentHandle), detail: config.agentHandle ?? "(not set)" });

  try {
    const page = await client.projects.listMessages({
      path: { id: projectId },
      query: { pageSize: 1 },
    });
    checks.push({ name: "list messages", ok: true, detail: `${pageItems(page).length} item(s) in probe page` });
  } catch (error) {
    checks.push({ name: "list messages", ok: false, detail: error.message });
  }

  const required = checks.filter((check) => check.name !== "agent handle");
  const ok = required.every((check) => check.ok);

  out.data({ ok, checks });
  if (!flags.quiet) {
    out.heading("photon-msg doctor");
    for (const check of checks) {
      out.line(`${check.ok ? "✓" : "✗"} ${check.name.padEnd(16)} ${check.detail}`);
    }
    out.line("");
    out.info(ok ? "configuration looks usable" : "fix the failing checks above");
  }

  if (!ok) {
    const failure = required.find((check) => !check.ok);
    throw new CliError(`Doctor check failed: ${failure.name}`, { hint: failure.detail });
  }
}
