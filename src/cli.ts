/**
 * Command router, context construction, and top-level error handling.
 */

import { parseOptions, route, wantsHelp } from "./args.js";
import { resolveConfig, requireCredentials } from "./config.js";
import { createOfflineClient, createPhotonClient } from "./client.js";
import { createUploader } from "./upload.js";
import { createOutput } from "./output.js";
import { CliError, EXIT, errorPayload, toCliError, usageError } from "./errors.js";
import { COMMAND_HELP, MAIN_HELP, VERSION } from "./help.js";
import { validateContentFlags } from "./content.js";
import type { Command, CommandContext, Flags, Uploader } from "./types.js";

import * as send from "./commands/send.js";
import * as messages from "./commands/messages.js";
import * as spaces from "./commands/spaces.js";
import * as users from "./commands/users.js";
import * as attachments from "./commands/attachments.js";
import * as misc from "./commands/misc.js";
import * as line from "./commands/line.js";
import * as doctor from "./commands/doctor.js";

export const ROUTES: Record<string, Command> = {
  send: { options: send.options, run: send.run },
  "messages list": { options: messages.list.options, run: messages.list.run },
  "messages get": { options: messages.get.options, run: messages.get.run },
  "messages watch": { options: messages.watch.options, run: messages.watch.run },
  "spaces list": { options: spaces.list.options, run: spaces.list.run },
  "spaces get": { options: spaces.get.options, run: spaces.get.run },
  "spaces create": { options: spaces.create.options, run: spaces.create.run },
  "users list": { options: users.list.options, run: users.list.run },
  "users get": { options: users.get.options, run: users.get.run },
  "users ensure": { options: users.ensure.options, run: users.ensure.run },
  "attachments upload": { options: attachments.upload.options, run: attachments.upload.run },
  "attachments get": { options: attachments.get.options, run: attachments.get.run },
  "attachments download": { options: attachments.download.options, run: attachments.download.run },
  typing: { options: misc.typing.options, run: misc.typing.run },
  read: { options: misc.read.options, run: misc.read.run },
  "line assign": { options: line.assign.options, run: line.assign.run },
  "line list": { options: line.list.options, run: line.list.run },
  "line get": { options: line.get.options, run: line.get.run },
  "line release": { options: line.release.options, run: line.release.run },
  doctor: { options: doctor.options, run: doctor.run },
};

/** Commands that fully handle --dry-run without touching the network. */
const DRY_RUN_SAFE: ReadonlySet<string> = new Set([
  "send",
  "spaces create",
  "users ensure",
  "typing",
  "read",
  "line assign",
  "line release",
  "attachments upload",
]);

const colorEnabled = (): boolean =>
  Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

/** Builds the credential-free context used by --dry-run. */
const offlineUploader = (): Uploader => () => {
  throw usageError("--dry-run cannot upload attachments.");
};

/** Runs the CLI and resolves to a process exit code. */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  // Help and version short-circuit before any credential work.
  if (argv.length === 0) {
    process.stdout.write(MAIN_HELP);
    return EXIT.OK;
  }

  const first = argv[0];
  if (first === "--help" || first === "-h" || first === "help") {
    process.stdout.write(MAIN_HELP);
    return EXIT.OK;
  }
  if (first === "--version" || first === "-v") {
    process.stdout.write(`${VERSION}\n`);
    return EXIT.OK;
  }

  const routed = route(argv, ROUTES);
  const commandName = routed.name as string | null;

  if (commandName === null || routed.spec === null) {
    const output = createOutput({ json: argv.includes("--json"), color: colorEnabled() });
    const cliError = usageError(
      `Unknown command: ${argv.filter((token) => !token.startsWith("-")).slice(0, 2).join(" ") || argv[0]}`,
      "Run `photon-msg --help` to see the available commands.",
    );
    output.error(cliError);
    return cliError.exitCode;
  }

  const spec = routed.spec;

  let flags: Flags;
  let positionals: string[];
  try {
    ({ flags, positionals } = parseOptions(routed.rest, spec.options));
  } catch (error) {
    const cliError = toCliError(error);
    createOutput({ color: colorEnabled() }).error(cliError);
    return cliError.exitCode;
  }

  const json = flags.json === true;

  if (wantsHelp(flags)) {
    process.stdout.write(COMMAND_HELP[commandName] ?? MAIN_HELP);
    return EXIT.OK;
  }
  if (flags.version === true) {
    process.stdout.write(`${VERSION}\n`);
    return EXIT.OK;
  }

  const out = createOutput({ json, color: colorEnabled() && flags.color !== false });
  const dryRun = flags["dry-run"] === true;

  try {
    if (dryRun && !DRY_RUN_SAFE.has(commandName)) {
      throw usageError(`--dry-run is not supported for "${commandName}".`, `Supported for: ${[...DRY_RUN_SAFE].join(", ")}.`);
    }

    // Validate contradictory flags before demanding credentials: a typo should
    // not look like an auth problem.
    if (commandName === "send") validateContentFlags(flags);

    const config = resolveConfig({ flags });
    // Dry runs stay offline; requireCredentials is only enforced when the
    // command will actually talk to the API.
    const creds = dryRun ? null : requireCredentials(config);
    const projectId = creds?.projectId ?? config.projectId ?? "(no project)";

    const client = creds
      ? createPhotonClient({
          apiKey: creds.apiKey,
          ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
          ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
        })
      : createOfflineClient();

    const upload: Uploader = creds
      ? createUploader({
          apiKey: creds.apiKey,
          projectId: creds.projectId,
          ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
          ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
        })
      : offlineUploader();

    const context: CommandContext = {
      flags,
      positionals,
      config,
      projectId,
      client,
      upload,
      out,
      dryRun,
    };

    await spec.run(context);
    return EXIT.OK;
  } catch (error) {
    const cliError = toCliError(error);
    if (json) {
      process.stderr.write(`${JSON.stringify(errorPayload(cliError), null, 2)}\n`);
    } else {
      out.error(cliError);
    }
    if (process.env.PHOTON_MSG_DEBUG) {
      process.stderr.write(`${cliError.stack ?? ""}\n`);
    }
    return cliError.exitCode;
  }
}

/** True when the CLI has a route for the given name. */
export const hasRoute = (name: string): boolean => Object.hasOwn(ROUTES, name);

export { CliError };
export const commands: string[] = Object.keys(ROUTES);
