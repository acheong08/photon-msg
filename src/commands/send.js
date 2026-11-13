/**
 * `send` — the core command.
 *
 * One command covers every outbound content type because the API takes a
 * polymorphic content object rather than an endpoint per action.
 */

import { randomUUID } from "node:crypto";
import { buildMessage, describeContent } from "../content.js";
import { resolveTarget } from "../target.js";
import { usageError } from "../errors.js";

export const options = {
  to: { type: "string" },
  space: { type: "string" },
  as: { type: "string" },
  platform: { type: "string" },

  text: { type: "string", multiple: true },
  "text-file": { type: "string" },
  format: { type: "string" },
  image: { type: "string", multiple: true },
  file: { type: "string", multiple: true },
  caption: { type: "string" },
  voice: { type: "string" },

  reaction: { type: "string" },
  "reaction-action": { type: "string" },
  poll: { type: "string" },
  "poll-option": { type: "string", multiple: true },
  "poll-mode": { type: "string" },

  edit: { type: "string" },
  delete: { type: "string" },
  reason: { type: "string" },
  read: { type: "boolean" },
  typing: { type: "string" },
  "participants-add": { type: "string", multiple: true },
  "participants-remove": { type: "string", multiple: true },
  group: { type: "boolean" },

  "reply-to": { type: "string" },
  "idempotency-key": { type: "string" },
  subject: { type: "string" },
  cc: { type: "string", multiple: true },
  bcc: { type: "string", multiple: true },
};

const UPLOAD_FLAGS = ["image", "file", "voice"];

/** Sends (or, with --dry-run, describes) one message. */
export async function run(ctx) {
  const { flags, projectId, client, out, dryRun, upload, config } = ctx;

  if (dryRun && UPLOAD_FLAGS.some((flag) => flags[flag] !== undefined)) {
    throw usageError("--dry-run cannot include attachments, because uploading them is a network write.");
  }

  const message = await buildMessage({
    flags,
    upload,
    getUsers: (ids) =>
      Promise.all(ids.map((userId) => client.projects.getUser({ path: { id: projectId, userId } }))),
  });

  const idempotencyKey = flags["idempotency-key"] ?? randomUUID();
  const target = dryRun
    ? {
        spaceId: flags.space ?? "(resolved from --to)",
        senderId: flags.as ?? config.agentHandle
          ? `${flags.as ?? config.agentHandle} (resolved at send time)`
          : "(agent)",
      }
    : await resolveTarget({ client, projectId, flags, defaultHandle: config.agentHandle });

  const request = {
    spaceId: target.spaceId,
    senderId: target.senderId,
    ...(message.parentMessageId ? { parentMessageId: message.parentMessageId } : {}),
    content: message.content,
    ...(message.email ? { email: message.email } : {}),
  };

  if (dryRun) {
    out.data({ dryRun: true, idempotencyKey, request });
    out.line(`would send ${describeContent(message.content)}`);
    out.keyValue([
      ["space", String(target.spaceId)],
      ["sender", String(target.senderId)],
      ["idempotency key", idempotencyKey],
    ]);
    return;
  }

  const sent = await client.projects.sendMessage({
    path: { id: projectId },
    headers: { "idempotency-key": idempotencyKey },
    body: request,
  });

  out.data({
    messageId: sent.id,
    status: sent.status,
    spaceId: sent.space?.id ?? request.spaceId,
    senderId: request.senderId,
    idempotencyKey,
    content: request.content,
  });

  if (!flags.quiet) {
    out.success(`sent ${sent.id} (${sent.status ?? "accepted"})`);
    out.info(`space ${request.spaceId} · idempotency ${idempotencyKey}`);
    out.info("acceptance is asynchronous; delivery is reported later on the message resource");
  }
}
