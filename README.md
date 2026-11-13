# photon-msg

A command-line client for **sending and reading messages through the [Photon](https://photon.codes) API**, written in TypeScript on top of the official [`@photon-ai/api`](https://www.npmjs.com/package/@photon-ai/api) SDK.

It covers the whole outbound surface the API exposes — text, images and files, voice notes, polls, reactions, edits, unsends, read receipts, typing indicators, participant changes and grouped messages — across iMessage, SMS, email, WhatsApp, WhatsApp Business and Telegram.

```
photon-msg send --to +14155550123 --as +16285024649 --text "hello"
photon-msg messages list --platform imessage --limit 20
photon-msg line assign --handle +14155550123
```

## Why this exists

The official `photon` CLI provisions projects, keys, numbers and billing. It does not send messages: the API is what sends, and the SDK expects you to write the plumbing. `photon-msg` is that plumbing, packaged as a single command with a scriptable interface.

## Install

```sh
npm install --global photon-msg
# or run without installing
npx photon-msg --help
```

Requires Node.js 20 or newer. The package ships `photon-msg` and `pmsg` binaries plus TypeScript declarations.

## Credentials

You need a **project API key** and the **project ID** the key belongs to.

```sh
photon login
photon project create --name my-agent --slug my-agent
photon project api-key create \
  --name photon-msg \
  --permission project:read \
  --permission project:write \
  --permission platforms:read \
  --permission platforms:write
```

Then export them (or pass `--api-key` / `--project` per call):

```sh
export PHOTON_API_KEY="pho_sk_..."
export PHOTON_PROJECT_ID="pho_prj_..."
```

`PHOTON_AGENT_HANDLE` sets the default `--as` sender. A config file at `~/.config/photon-msg/config.json` is also read:

```json
{ "projectId": "pho_prj_...", "agentHandle": "+16285024649" }
```

Precedence is flags → environment → config file. Secrets in the config file are optional; prefer the environment or a keychain.

Verify the wiring before sending anything:

```sh
photon-msg doctor
```

## Getting a sending identity

Every message needs a sender that belongs to the project. There are two kinds of iMessage line:

| | Pooled ("shared") line | Dedicated line |
| --- | --- | --- |
| Cost | Included in the free plan (25 seats) | Paid plan |
| Can start a conversation | **No** | Yes |
| Can reply once written to | Yes | Yes |

Assign a pooled line to the human who will test with you:

```sh
photon-msg line assign --handle +14155550123
# ✓ line +16285024649 assigned for +14155550123
```

The handle you assign is the person who may write to that line — Photon maps them to a pooled number, and messages from anyone else are ignored.

> **The most common error.** A pooled line cannot open a conversation. Sending first answers `403 SHARED_LINE_INBOUND_REQUIRED`, and the CLI prints that with the fix. Have the recipient send any message to the line, then reply inside that conversation with `--space`. For agent-initiated messages you need a purchased SMS number (`photon project platform sms purchase`, $2/month) or a dedicated iMessage line.

## Addressing

Two ways to name the destination:

```sh
# 1. Start or reuse a direct conversation. Idempotent for the same pair.
photon-msg send --to +14155550123 --as +16285024649 --text "hello"

# 2. Reply inside an existing conversation.
photon-msg send --space pho_spc_... --as pho_usr_... --text "hi again"
```

`--as` accepts a handle or a `pho_usr_` ID. `--to` accepts a handle (E.164 phone or email) or a user ID. Find existing IDs with `photon-msg spaces list` and `photon-msg users list`.

## Commands

### send

```sh
# text
photon-msg send --to +14155550123 --as +16285024649 --text "hello"
photon-msg send --space pho_spc_... --as pho_usr_... --text-file ./body.txt
echo "piped body" | photon-msg send --space pho_spc_... --as pho_usr_... --text-file -

# images and files
photon-msg send --space pho_spc_... --as pho_usr_... --image ./photo.png --caption "look"
photon-msg send --space pho_spc_... --as pho_usr_... --file https://example.com/report.pdf
photon-msg send --space pho_spc_... --as pho_usr_... --voice ./memo.m4a

# polls
photon-msg send --space pho_spc_... --as pho_usr_... \
  --poll "Lunch?" --poll-option Yes --poll-option No --poll-mode single

# reactions (needs the target message)
photon-msg send --space pho_spc_... --as pho_usr_... --reply-to pho_msg_... --reaction "❤️"
photon-msg send --space pho_spc_... --as pho_usr_... --reply-to pho_msg_... \
  --reaction "❤️" --reaction-action remove

# edit an already-sent message
photon-msg send --space pho_spc_... --as pho_usr_... --edit pho_msg_... --text "fixed typo"

# unsend
photon-msg send --space pho_spc_... --as pho_usr_... --delete pho_msg_... --reason "sent by mistake"

# read receipt and typing indicator
photon-msg send --space pho_spc_... --as pho_usr_... --reply-to pho_msg_... --read
photon-msg send --space pho_spc_... --as pho_usr_... --typing on

# several parts as one logical message
photon-msg send --space pho_spc_... --as pho_usr_... --group \
  --text "two photos" --image ./a.png --image ./b.png

# email-specific options
photon-msg send --platform email --to you@example.com --as agent@yourdomain.com \
  --text "report" --subject "Weekly" --cc teammate@example.com
```

Useful flags on every send: `--reply-to <messageId>` (threading), `--idempotency-key <key>` (reuse across retries), `--dry-run` (print the request), `--json`.

### Reading

```sh
photon-msg messages list --limit 20
photon-msg messages list --platform imessage --direction received --created-since 2026-11-01T00:00:00Z
photon-msg messages list --space pho_spc_... --order asc --page-size 50
photon-msg messages get pho_msg_...
photon-msg messages watch --platform imessage --interval 2   # JSON lines, ctrl-c to stop
```

`messages watch` prints one JSON object per line, so `| jq` or a pipe into another process works. It only reports messages created after it starts.

### Spaces and users

```sh
photon-msg spaces list --platform imessage
photon-msg spaces get pho_spc_...
photon-msg spaces create --platform imessage --participant +16285024649 --participant +14155550123
photon-msg users list
photon-msg users ensure --handle +14155550123
```

On iMessage the first `--participant` is the creator of the conversation, so put the agent first.

### Attachments and conversation state

```sh
photon-msg attachments upload ./photo.png
photon-msg attachments get pho_att_...
photon-msg attachments download pho_att_... --out ./photo.png
photon-msg typing --space pho_spc_... --as pho_usr_... --on
photon-msg read pho_msg_...
```

### Lines

```sh
photon-msg line assign --handle +14155550123
photon-msg line list --include-released
photon-msg line get pho_asg_...
photon-msg line release pho_asg_...
```

## Output and exit codes

`--json` writes a single JSON document to stdout and keeps stdout clean for piping. Errors go to stderr, as JSON too when `--json` is set.

| Exit code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | API or runtime failure |
| 2 | Usage error (bad flags, missing credentials) |
| 3 | Authentication failed |
| 4 | Not found |
| 5 | Forbidden (including shared-line rules) |
| 6 | Conflict (for example a reused idempotency key) |

Known problem codes carry a `hint` explaining what to change; `SHARED_LINE_INBOUND_REQUIRED` is the one you will meet first.

**Acceptance is not delivery.** A `send` that returns without error means the API queued the message. Delivery is reported later on the message resource — check it with `photon-msg messages get`:

```
pho_msg_0xdm9rj40ah8tt6tfya6bb46a5   dispatched → delivered
```

## Using it as a library

The building blocks are exported with their types, so a script or agent can reuse
them without shelling out.

```ts
import { randomUUID } from "node:crypto";
import { createPhotonClient, buildMessage, resolveTarget } from "photon-msg";

const apiKey = process.env.PHOTON_API_KEY!;
const projectId = process.env.PHOTON_PROJECT_ID!;
const client = createPhotonClient({ apiKey });

const { content } = await buildMessage({
  flags: { text: "hello" },
  upload: async () => {
    throw new Error("no attachments in this example");
  },
  getUsers: async () => [],
});

const target = await resolveTarget({
  client,
  projectId,
  flags: { to: "+14155550123", as: "+16285024649" },
});

await client.projects.sendMessage({
  path: { id: projectId },
  headers: { "idempotency-key": randomUUID() },
  body: { spaceId: target.spaceId, senderId: target.senderId, content },
});
```

Content payloads are typed with the SDK's own `SendContent` union, so a payload
that compiles is one the API accepts in shape.

## Scope

Included: the messaging surface — messages, spaces, users, attachments, typing, read receipts, and shared-line assignment.

Deliberately excluded, because the official `photon` CLI already handles it: organizations, billing, SMS number purchase, email domain verification, webhooks and API-key management.

Notable API behaviours this CLI surfaces rather than hides:

- Text and images only on Beta iMessage; tapbacks, polls, effects and voice notes are Stable-only.
- Shared lines cannot start conversations or carry group chats.
- One-time passcodes are filtered on Photon iMessage lines, so they cannot be used for third-party account verification.
- Bulk sends are not implemented: there is no retry queue, so treat `send` as one message per invocation.

## Development

```sh
npm install        # installs the SDK and the TypeScript toolchain
npm run typecheck  # tsc --noEmit, strict
npm test           # compiles src + tests, then runs 65 tests
npm run build      # emits dist/ with declarations
```

The project is TypeScript in strict mode with `noUncheckedIndexedAccess`,
`verbatimModuleSyntax` and ESM `NodeNext` resolution. Sources live in `src/`,
tests in `test/`; both are compiled before the suite runs, so the tests exercise
the same JavaScript the published package ships.

Tests cover content assembly, targeting, upload framing, error mapping and the
real binary's behaviour. They never need credentials or network access. CI runs
typecheck, tests and a build smoke test on Node 20, 22 and 24.

Live smoke test against a real project:

```sh
export PHOTON_API_KEY=... PHOTON_PROJECT_ID=...
photon-msg doctor
photon-msg spaces list
```

## License

MIT
