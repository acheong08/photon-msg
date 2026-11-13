/**
 * `spaces` — conversations. `create` is idempotent: it reuses an exact match.
 */

import { pageItems, handleOf } from "../client.js";
import { formatTime } from "../output.js";
import { usageError } from "../errors.js";
import { resolveUser } from "../target.js";

export const list = {
  options: {
    platform: { type: "string" },
    participant: { type: "string" },
    "participant-handle": { type: "string" },
    order: { type: "string" },
    "order-by": { type: "string" },
    "created-since": { type: "string" },
    "created-before": { type: "string" },
    "page-size": { type: "string" },
    "page-token": { type: "string" },
  },

  async run(ctx) {
    const { client, projectId, flags, out } = ctx;
    const query = {};
    if (flags.platform) query.platform = flags.platform;
    if (flags.participant) query.participantId = flags.participant;
    if (flags["participant-handle"]) query.participantHandle = flags["participant-handle"];
    if (flags.order) query.order = flags.order;
    if (flags["order-by"]) query.orderBy = flags["order-by"];
    if (flags["created-since"]) query.createdSince = flags["created-since"];
    if (flags["created-before"]) query.createdBefore = flags["created-before"];
    if (flags["page-size"]) query.pageSize = Number(flags["page-size"]);
    if (flags["page-token"]) query.pageToken = flags["page-token"];

    const page = await client.projects.listSpaces({ path: { id: projectId }, query });
    const items = pageItems(page);

    out.data({ items, count: items.length, nextPageToken: page?.nextPageToken ?? null });
    out.table(items, [
      { header: "ID", value: (s) => s.id },
      { header: "PLATFORM", value: (s) => s.platform },
      { header: "KIND", value: (s) => s.kind },
      { header: "NAME", value: (s) => s.title ?? s.name ?? "" },
      { header: "CREATED", value: (s) => formatTime(s.createdAt) },
    ]);
    if (!flags.quiet) out.info(`${items.length} space(s)`);
  },
};

export const get = {
  options: {},
  async run(ctx) {
    const { client, projectId, positionals, out } = ctx;
    const spaceId = positionals[0];
    if (!spaceId) throw usageError("Usage: photon-msg spaces get <spaceId>");

    const space = await client.projects.getSpace({ path: { id: projectId, spaceId } });
    out.data(space);
    out.heading(`space ${space.id}`);
    out.keyValue([
      ["platform", space.platform],
      ["kind", space.kind],
      ["title", space.title ?? space.name ?? ""],
      ["created", formatTime(space.createdAt)],
    ]);
  },
};

export const create = {
  options: {
    platform: { type: "string" },
    participant: { type: "string", multiple: true },
    "idempotency-key": { type: "string" },
  },

  async run(ctx) {
    const { client, projectId, flags, out, dryRun } = ctx;
    const platform = flags.platform ?? "imessage";
    const participants = flags.participant ?? [];
    if (participants.length < 1) {
      throw usageError("Pass at least one --participant <handle|userId>.");
    }

    if (dryRun) {
      out.data({ dryRun: true, platform, participants });
      out.line(`would create a ${platform} space with ${participants.length} participant(s)`);
      return;
    }

    const resolved = await Promise.all(
      participants.map((input) => resolveUser({ client, projectId, platform, input })),
    );

    const space = await client.projects.createOrGetSpace({
      path: { id: projectId },
      headers: { "idempotency-key": flags["idempotency-key"] ?? `photon-msg:space:${resolved.map((u) => u.id).join(":")}` },
      body: { platform, participantIds: resolved.map((u) => u.id) },
    });

    out.data({ spaceId: space.id, kind: space.kind, platform: space.platform, participants: resolved.map((u) => ({ id: u.id, handle: handleOf(u), kind: u.kind })) });
    if (!flags.quiet) out.success(`space ${space.id} (${space.kind ?? "?"})`);
  },
};
