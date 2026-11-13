/**
 * Help text. Kept as data so `--help` output stays consistent across commands.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
  name?: string;
  version?: string;
}

/**
 * Reads the version from the nearest package.json.
 *
 * This module can be loaded from `dist/` (published) or `.test-build/src/`
 * (compiled tests), so the manifest is found by walking up rather than assuming
 * a fixed depth. Walking up also survives a change to the output layout.
 */
function readVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = join(directory, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as PackageJson;
        if (pkg.version && (pkg.name === undefined || pkg.name === "photon-msg")) {
          return pkg.version;
        }
      } catch {
        // Fall through to the parent directory.
      }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return "0.0.0";
}

/** Single source of truth for the version: package.json. */
export const VERSION: string = readVersion();

export const MAIN_HELP = `photon-msg ${VERSION} — send and read messages through the Photon API

USAGE
  photon-msg <command> [options]

COMMANDS
  send               Send any content type: text, image, voice, poll, reaction, edit, unsend
  messages list      List messages with filters
  messages get       Fetch one message
  messages watch     Follow new messages as JSON lines
  spaces list        List conversations
  spaces get         Fetch one conversation
  spaces create      Create or reuse a conversation
  users list         List people and agents in the project
  users get          Fetch one user
  users ensure       Resolve a handle to a user ID
  attachments upload Upload a file or URL
  attachments get    Inspect attachment metadata
  attachments download  Write attachment bytes to disk
  typing             Start or stop a typing indicator
  read               Mark a message read
  line assign        Assign a pooled iMessage line to a handle
  line list          List shared-line assignments
  line get           Fetch one assignment
  line release       Release an assignment
  doctor             Check credentials and project wiring
  help               Show this help

GLOBAL OPTIONS
  --json               Machine-readable output
  --no-color           Disable ANSI color
  --api-key <key>      Project API key (or PHOTON_API_KEY)
  --project <id>       Project ID (or PHOTON_PROJECT_ID)
  --base-url <url>     API origin (or PHOTON_API_BASE_URL)
  --timeout <ms>       Per-request timeout
  --dry-run            Print the request instead of sending it
  --quiet, -q          Suppress the summary lines
  --help, -h           Show help
  --version, -v        Show version

ADDRESSING
  --space <spaceId> --as <agent>    reply into an existing conversation
  --to <handle> --as <agent>        start or reuse a direct conversation
  --as accepts a handle or a pho_usr_ ID; PHOTON_AGENT_HANDLE is the default.

EXAMPLES
  photon-msg send --to +14155550123 --as +16285024649 --text "hello"
  photon-msg send --space pho_spc_... --as pho_usr_... --image ./photo.png --caption "look"
  photon-msg send --space pho_spc_... --as pho_usr_... --poll "Lunch?" --poll-option Yes --poll-option No
  photon-msg send --space pho_spc_... --as pho_usr_... --reply-to pho_msg_... --reaction "❤️"
  photon-msg send --space pho_spc_... --as pho_usr_... --edit pho_msg_... --text "fixed typo"
  photon-msg messages list --platform imessage --direction received --limit 20
  photon-msg line assign --handle +14155550123

Addressing a new conversation requires a line that may start it. Pooled shared
lines cannot: the recipient must message the line first, and the API answers
403 SHARED_LINE_INBOUND_REQUIRED until they do.
`;

export const COMMAND_HELP: Record<string, string> = {
  send: `photon-msg send — send one message

DESTINATION
  --space <spaceId>       Existing conversation (reply, edit, reaction, ...)
  --to <handle>           Start or reuse a direct conversation with this handle
  --as <handle|userId>    Sender agent (default: PHOTON_AGENT_HANDLE)
  --platform <name>       imessage | sms | email | whatsapp | whatsapp_business | telegram

CONTENT (choose one, or combine with --group)
  --text <string>         Text body (repeatable; lines are joined)
  --text-file <path>      Read the body from a file, or "-" for stdin
  --format <plain|markdown>
  --image <path|url>      Image attachment (repeatable)
  --file <path|url>       Any attachment (repeatable)
  --caption <string>      Caption for a single attachment
  --voice <path>          Voice note
  --poll <question> --poll-option <text> [--poll-option ...] [--poll-mode single|multiple]
  --reaction <emoji> [--reaction-action add|remove]   needs --reply-to
  --edit <messageId> --text <new text>                edit a sent message
  --delete <messageId> [--reason <text>]              unsend a message
  --read                          read receipt, needs --reply-to
  --typing <on|off>               typing indicator as content
  --participants-add <userId> --participants-remove <userId>
  --group                         send the supplied parts as one group

OTHER
  --reply-to <messageId>  Thread the message under another
  --idempotency-key <key> Reuse across retries of the same logical send
  --subject/--cc/--bcc    Email-only options

Acceptance is asynchronous: a successful send means the API queued the message,
not that the recipient has seen it.
`,
  "messages list": `photon-msg messages list — list messages

  --platform <name>          Restrict to one platform
  --direction received|dispatched
  --space <spaceId>          Restrict to a conversation
  --resource <resourceId>    Restrict to a resource
  --perspective-user <id>    Restrict to one user's view (needs --space)
  --created-since/--created-before   RFC 3339 bounds on createdAt
  --updated-since/--updated-before   RFC 3339 bounds on updatedAt
  --exclude-content-types <list>     Comma-separated content types
  --order asc|desc  --order-by <field>
  --page-size <n>  --page-token <token>  --limit <n>
`,
  "messages watch": `photon-msg messages watch — follow new messages as JSON lines

  --platform <name>  --space <spaceId>  --direction <dir>
  --interval <seconds>   Poll interval (default 2)
  --for <seconds>        Stop after this long (default: run until interrupted)
  --since <rfc3339>      Start point (default: now)
`,
  "spaces create": `photon-msg spaces create — create or reuse a conversation

  --platform <name>
  --participant <handle|userId>   Repeatable; order matters on iMessage (first is creator)
  --idempotency-key <key>
`,
  "users ensure": `photon-msg users ensure — resolve a handle to a user ID

  --handle <handle>    Phone (E.164) or email
  --platform <name>
`,
  "attachments upload": `photon-msg attachments upload — upload a file or URL

  <path|url>  --content-type <mime>
`,
  typing: `photon-msg typing — typing indicator

  --space <spaceId>  --as <agent>  --on | --off
`,
  "line assign": `photon-msg line assign — assign a pooled iMessage line

  --handle <+15551234567>   The human who will write to the line
  --email <address>         Optional invite address
  --first-name/--last-name
  --idempotency-key <key>   Reuse for retries of the same assignment
`,
};
