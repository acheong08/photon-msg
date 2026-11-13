/**
 * `typing` and `read` — small conversation-state commands.
 *
 * Typing goes through its own endpoint (`setSpaceTyping`); the same signal can
 * also travel as `space.typing.update` content via `send --typing`.
 */

import { randomUUID } from "node:crypto";
import { usageError } from "../errors.js";
import { resolveTarget } from "../target.js";

export const typing = {
  options: {
    space: { type: "string" },
    as: { type: "string" },
    on: { type: "boolean" },
    off: { type: "boolean" },
  },

  async run(ctx) {
    const { client, projectId, flags, out, dryRun, config } = ctx;
    if (!flags.space) throw usageError("Pass --space <spaceId> (using --to here would create a conversation, which typing should not do).");
    if (flags.on === flags.off) throw usageError("Pass exactly one of --on or --off.");

    const typingState = flags.on === true;
    const target = dryRun
      ? { senderId: flags.as ?? config.agentHandle ?? "(agent)" }
      : await resolveTarget({ client, projectId, flags, defaultHandle: config.agentHandle });

    if (dryRun) {
      out.data({ dryRun: true, spaceId: flags.space, senderId: target.senderId, typing: typingState });
      out.line(`would set typing=${typingState} in ${flags.space}`);
      return;
    }

    await client.projects.setSpaceTyping({
      path: { id: projectId, spaceId: flags.space },
      body: { senderId: target.senderId, typing: typingState },
    });

    out.data({ spaceId: flags.space, senderId: target.senderId, typing: typingState });
    out.success(`typing ${typingState ? "on" : "off"} in ${flags.space}`);
  },
};

export const read = {
  options: {
    "idempotency-key": { type: "string" },
  },

  async run(ctx) {
    const { client, projectId, flags, positionals, out, dryRun } = ctx;
    const messageId = positionals[0];
    if (!messageId) throw usageError("Usage: photon-msg read <messageId>");

    const idempotencyKey = flags["idempotency-key"] ?? randomUUID();
    if (dryRun) {
      out.data({ dryRun: true, messageId, idempotencyKey });
      out.line(`would mark ${messageId} read`);
      return;
    }

    await client.projects.markMessageRead({
      path: { id: projectId, messageId },
      headers: { "idempotency-key": idempotencyKey },
    });

    out.data({ messageId, read: true, idempotencyKey });
    out.success(`marked ${messageId} read`);
  },
};
