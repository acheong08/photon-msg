/**
 * `send` — the core command.
 *
 * One command covers every outbound content type because the API takes a
 * polymorphic content object rather than an endpoint per action.
 */

import { randomUUID } from "node:crypto";
import type { ParseArgsOptionsConfig } from "node:util";

import { buildMessage, describeContent } from "../content.js";
import { resolveTarget } from "../target.js";
import { usageError } from "../errors.js";
import type { CommandContext, Flags, UserRecord } from "../types.js";

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
} as const satisfies ParseArgsOptionsConfig;

const UPLOAD_FLAGS: ReadonlyArray<keyof Flags> = ["image", "file", "voice"];

/** Sends (or, with --dry-run, describes) one message. */
export async function run({ flags, projectId, client, out, dryRun, upload, config }: CommandContext): Promise<void> {
  if (dryRun && UPLOAD_FLAGS.some((flag) => flags[flag] !== undefined)) {
    throw usageError("--dry-run cannot include attachments, because uploading them is a network write.");
  }

  const message = await buildMessage({
    flags,
    upload,
    getUsers: async (ids) =>
      Promise.all(
        ids.map(async (userId) => {
          const user = await client.projects.getUser({ path: { id: projectId, userId } });
          return user as unknown as UserRecord;
        }),
      ),
  });

  const idempotencyKey = flags["idempotency-key"] ?? randomUUID();

  if (dryRun) {
    const spaceId = flags.space ?? "(resolved from --to)";
    const senderId = flags.as ?? config.agentHandle;
    const request = {
      spaceId,
      senderId: senderId ? `${senderId} (resolved at send time)` : "(agent)",
      ...(message.parentMessageId ? { parentMessageId: message.parentMessageId } : {}),
      content: message.content,
      ...(message.email ? { email: message.email } : {}),
    };
    out.data({ dryRun: true, idempotencyKey, request });
    out.line(`would send ${describeContent(message.content)}`);
    out.keyValue([
      ["space", request.spaceId],
      ["sender", request.senderId],
      ["idempotency key", idempotencyKey],
    ]);
    return;
  }

  const target = await resolveTarget({ client, projectId, flags, defaultHandle: config.agentHandle });

  const request = {
    spaceId: target.spaceId,
    senderId: target.senderId,
    ...(message.parentMessageId ? { parentMessageId: message.parentMessageId } : {}),
    content: message.content,
    ...(message.email ? { email: message.email } : {}),
  };

  const sent = await client.projects.sendMessage({
    path: { id: projectId },
    headers: { "idempotency-key": idempotencyKey },
    body: request,
  });

  const sentRecord = sent as unknown as { id: string; status?: string };

  out.data({
    messageId: sentRecord.id,
    status: sentRecord.status,
    spaceId: request.spaceId,
    senderId: request.senderId,
    idempotencyKey,
    content: request.content,
  });

  if (!flags.quiet) {
    out.success(`sent ${sentRecord.id} (${sentRecord.status ?? "accepted"})`);
    out.info(`space ${request.spaceId} · idempotency ${idempotencyKey}`);
    out.info("acceptance is asynchronous; delivery is reported later on the message resource");
  }
}
