# photon-msg

A command line client for the [Photon](https://photon.codes) messaging API. It sends text, images, voice notes, polls, reactions, edits and unsends to iMessage, SMS, email, WhatsApp and Telegram, and it reads messages back out.

```sh
photon-msg send --to +14155550123 --as +16285024649 --text "hello"
photon-msg messages list --platform imessage --limit 20
```

Written in TypeScript on top of [`@photon-ai/api`](https://www.npmjs.com/package/@photon-ai/api).

The official `photon` CLI sets up projects, keys, numbers and billing. It doesn't send anything itself, so this fills that gap.

## Install

```sh
npm install --global photon-msg
```

From a checkout instead:

```sh
git clone <this repo> && cd photon-msg
npm install && npm run build && npm link
```

Node 22 or newer. Installs `photon-msg` and `pmsg`

## Credentials

You need a project API key and the project ID it belongs to.

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

```sh
export PHOTON_API_KEY="pho_sk_..."
export PHOTON_PROJECT_ID="pho_prj_..."
```

`platforms:read` and `platforms:write` are only needed for the `line` commands. Without them, `line list` returns 403.

`PHOTON_AGENT_HANDLE` sets a default sender, so you can leave out `--as`:

```sh
export PHOTON_AGENT_HANDLE="+16285024649"
```

Flags beat environment variables, which beat `~/.config/photon-msg/config.json`:

```json
{ "projectId": "pho_prj_...", "agentHandle": "+16285024649" }
```

Keep keys out of that file. Use the environment or a secret manager.

Check everything resolves before you send:

```sh
photon-msg doctor
```

## Getting a line to send from

Every message needs a sender that belongs to the project. For iMessage there are two kinds of line.

| | Pooled shared line | Dedicated line |
| --- | --- | --- |
| Cost | 25 seats on the free plan | Paid plan |
| Can start a conversation | No | Yes |
| Can reply once written to | Yes | Yes |

Assign a pooled line to the person you want to test with:

```sh
photon-msg line assign --handle +14155550123
# line +16285024649 assigned for +14155550123
```

A pooled line can only reply. If you try to send first, the API returns `403 SHARED_LINE_INBOUND_REQUIRED`, and the CLI prints what to do about it. Have the person text the line, then reply inside that conversation with `--space`. Starting conversations yourself needs a purchased SMS number (`photon project platform sms purchase`, $2/month) or a dedicated line.

## Addressing

Two ways to say where a message goes.

```sh
# Start or reuse a direct conversation. Repeat calls reuse the same space.
photon-msg send --to +14155550123 --as +16285024649 --text "hello"

# Reply inside an existing conversation.
photon-msg send --space pho_spc_... --as pho_usr_... --text "hi again"
```

`--as` takes a handle or a `pho_usr_` ID. `--to` takes a phone number, an email address or a user ID. The platform defaults to iMessage, or to email when the handle contains `@`. Override it with `--platform`.

Get IDs from `photon-msg spaces list` and `photon-msg users list`.

## Sending

Text:

```sh
photon-msg send --to +14155550123 --as +16285024649 --text "hello"
photon-msg send --space pho_spc_... --as pho_usr_... --text-file ./body.txt
echo "from stdin" | photon-msg send --space pho_spc_... --as pho_usr_... --text-file -
```

Images and files:

```sh
photon-msg send --space pho_spc_... --as pho_usr_... --image ./photo.png --caption "look"
photon-msg send --space pho_spc_... --as pho_usr_... --file https://example.com/report.pdf
photon-msg send --space pho_spc_... --as pho_usr_... --voice ./memo.m4a
```

Polls:

```sh
photon-msg send --space pho_spc_... --as pho_usr_... \
  --poll "Lunch?" --poll-option Yes --poll-option No --poll-mode single
```

Reactions, edits, unsends and read receipts all need the message they act on:

```sh
photon-msg send --space pho_spc_... --as pho_usr_... --reply-to pho_msg_... --reaction "❤️"
photon-msg send --space pho_spc_... --as pho_usr_... --reply-to pho_msg_... \
  --reaction "❤️" --reaction-action remove
photon-msg send --space pho_spc_... --as pho_usr_... --edit pho_msg_... --text "fixed typo"
photon-msg send --space pho_spc_... --as pho_usr_... --delete pho_msg_... --reason "wrong chat"
photon-msg send --space pho_spc_... --as pho_usr_... --reply-to pho_msg_... --read
```

Typing indicators, as content or through their own endpoint:

```sh
photon-msg send --space pho_spc_... --as pho_usr_... --typing on
photon-msg typing --space pho_spc_... --as pho_usr_... --on
```

Several parts as one message:

```sh
photon-msg send --space pho_spc_... --as pho_usr_... --group \
  --text "two photos" --image ./a.png --image ./b.png
```

Email options, which are ignored on other platforms:

```sh
photon-msg send --platform email --to you@example.com --as agent@yourdomain.com \
  --text "report" --subject "Weekly" --cc teammate@example.com
```

`--reply-to` threads a message under another one. `--idempotency-key` makes a retry part of the same logical send. `--dry-run` prints the request without sending it.

A successful send means the API queued the message. Delivery is reported later, so check the message if you need to know it arrived.

## Reading

```sh
photon-msg messages list --limit 20
photon-msg messages list --platform imessage --direction received --created-since 2026-11-01T00:00:00Z
photon-msg messages list --space pho_spc_... --order asc --page-size 50
photon-msg messages get pho_msg_...
photon-msg messages watch --platform imessage --interval 2
```

`messages watch` prints one JSON object per line, so it pipes into `jq` or another process. It only reports messages created after it starts.

Conversations and people:

```sh
photon-msg spaces list --platform imessage
photon-msg spaces get pho_spc_...
photon-msg spaces create --platform imessage --participant +16285024649 --participant +14155550123
photon-msg users list
photon-msg users ensure --handle +14155550123
```

On iMessage the first `--participant` becomes the creator of the conversation, so put the agent first.

Attachments and lines:

```sh
photon-msg attachments upload ./photo.png
photon-msg attachments get pho_att_...
photon-msg attachments download pho_att_... --out ./photo.png
photon-msg line list --include-released
photon-msg line get pho_asg_...
photon-msg line release pho_asg_...
```

## Output and exit codes

`--json` writes one JSON document to stdout and leaves stdout clean enough to pipe. Errors go to stderr, as JSON too when `--json` is set.

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | API or runtime failure |
| 2 | Usage error, including missing credentials |
| 3 | Authentication failed |
| 4 | Not found |
| 5 | Forbidden, including shared-line rules |
| 6 | Conflict, such as a reused idempotency key |

Problem codes the API returns carry a hint that says what to change.

## As a library

The pieces are exported with types, so a script can skip the CLI.

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

`buildMessage` returns the SDK's `SendContent` union, so a payload that compiles matches what the API accepts in shape.

## What has been tested

Text sends and replies, message listing, attachment upload and download, and line assignment have all been run against a live project. The attachment round trip is byte-identical.

Not verified against a live project: SMS, email, WhatsApp and Telegram sends, and the poll, reaction, edit, unsend and participant commands. The code paths exist and the payloads typecheck, but the platforms differ in what they accept. Beta iMessage carries text and images only, so polls and reactions will fail there even though the API defines them.

There's no bulk send and no retry queue. One invocation, one message.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

`npm test` compiles `src` and `test` and runs 65 tests. None of them need credentials or network access. CI runs the typecheck, the tests and a build smoke test on Node 22 and 24.

TypeScript is strict, with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`, on ESM with `NodeNext` resolution. Sources are in `src`, tests in `test`, and `dist` is built by `prepublishOnly`.

## License

MIT
