/**
 * `spaces` — conversations. `create` is idempotent: it reuses an exact match.
 */

import type { ParseArgsOptionsConfig } from "node:util";

import { handleOf, nextPageToken, pageItems } from "../client.js";
import { formatTime, type TableColumn } from "../output.js";
import { usageError } from "../errors.js";
import { resolveUser } from "../target.js";
import type { CommandContext, SpaceRecord } from "../types.js";

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
  } as const satisfies ParseArgsOptionsConfig,

  async run({ client, projectId, flags, out }: CommandContext): Promise<void> {
    const query: Record<string, string | number> = {};
    if (flags.platform) query.platform = flags.platform;
    if (typeof flags.participant === "string") query.participantId = flags.participant;
    if (flags["participant-handle"]) query.participantHandle = flags["participant-handle"];
    if (flags.order) query.order = flags.order;
    if (flags["order-by"]) query.orderBy = flags["order-by"];
    if (flags["created-since"]) query.createdSince = flags["created-since"];
    if (flags["created-before"]) query.createdBefore = flags["created-before"];
    if (flags["page-size"]) query.pageSize = Number(flags["page-size"]);
    if (flags["page-token"]) query.pageToken = flags["page-token"];

    const page = await client.projects.listSpaces({ path: { id: projectId }, query });
    const items = pageItems<SpaceRecord>(page);

    const columns: Array<TableColumn<SpaceRecord>> = [
      { header: "ID", value: (space) => space.id },
      { header: "PLATFORM", value: (space) => space.platform },
      { header: "KIND", value: (space) => space.kind },
      { header: "NAME", value: (space) => space.title ?? space.name ?? "" },
      { header: "CREATED", value: (space) => formatTime(space.createdAt) },
    ];

    out.data({ items, count: items.length, nextPageToken: nextPageToken(page) ?? null });
    out.table(items, columns);
    if (!flags.quiet) out.info(`${items.length} space(s)`);
  },
};

export const get = {
  options: {} as const satisfies ParseArgsOptionsConfig,

  async run({ client, projectId, positionals, out }: CommandContext): Promise<void> {
    const spaceId = positionals[0];
    if (!spaceId) throw usageError("Usage: photon-msg spaces get <spaceId>");

    const space = (await client.projects.getSpace({
      path: { id: projectId, spaceId },
    })) as unknown as SpaceRecord;

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
  } as const satisfies ParseArgsOptionsConfig,

  async run({ client, projectId, flags, out, dryRun }: CommandContext): Promise<void> {
    const platform = flags.platform ?? "imessage";
    const inputs = Array.isArray(flags.participant)
      ? flags.participant
      : flags.participant
        ? [flags.participant]
        : [];

    if (inputs.length < 1) {
      throw usageError("Pass at least one --participant <handle|userId>.");
    }

    if (dryRun) {
      out.data({ dryRun: true, platform, participants: inputs });
      out.line(`would create a ${platform} space with ${inputs.length} participant(s)`);
      return;
    }

    const resolved = await Promise.all(
      inputs.map((input) => resolveUser({ client, projectId, platform, input })),
    );
    const participantIds = resolved.map((user) => String(user.id));

    const space = (await client.projects.createOrGetSpace({
      path: { id: projectId },
      headers: {
        "idempotency-key": flags["idempotency-key"] ?? `photon-msg:space:${participantIds.join(":")}`,
      },
      body: { platform, participantIds },
    })) as unknown as SpaceRecord;

    out.data({
      spaceId: space.id,
      kind: space.kind,
      platform: space.platform,
      participants: resolved.map((user) => ({
        id: user.id,
        handle: handleOf(user),
        kind: user.kind,
      })),
    });
    if (!flags.quiet) out.success(`space ${space.id} (${space.kind ?? "?"})`);
  },
};
