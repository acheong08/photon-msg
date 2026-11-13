/**
 * `messages` — list, fetch, and follow messages.
 */

import { setTimeout as sleep } from "node:timers/promises";
import type { ParseArgsOptionsConfig } from "node:util";

import { handleOf, nextPageToken, pageItems } from "../client.js";
import { formatTime, summarizeContent, type TableColumn } from "../output.js";
import { usageError } from "../errors.js";
import type { CommandContext, Flags, MessageRecord } from "../types.js";

/** Builds the SDK query object from list flags. */
const listQuery = (flags: Flags): Record<string, string | number> => {
  const query: Record<string, string | number> = {};
  const map: Array<[keyof Flags, string]> = [
    ["platform", "platform"],
    ["direction", "direction"],
    ["order", "order"],
    ["order-by", "orderBy"],
    ["space", "spaceId"],
    ["resource", "resourceId"],
    ["perspective-user", "perspectiveUserId"],
    ["created-since", "createdSince"],
    ["created-before", "createdBefore"],
    ["updated-since", "updatedSince"],
    ["updated-before", "updatedBefore"],
    ["exclude-content-types", "excludeContentTypes"],
    ["page-token", "pageToken"],
  ];
  for (const [flag, key] of map) {
    const value = flags[flag];
    if (typeof value === "string") query[key] = value;
  }
  if (flags["page-size"] !== undefined) query.pageSize = Number(flags["page-size"]);
  return query;
};

const columns: Array<TableColumn<MessageRecord>> = [
  { header: "ID", value: (message) => message.id },
  { header: "TIME", value: (message) => formatTime(message.createdAt) },
  { header: "PLATFORM", value: (message) => message.platform },
  { header: "DIRECTION", value: (message) => message.direction },
  { header: "STATUS", value: (message) => message.status },
  { header: "FROM", value: (message) => handleOf(message.sentBy) },
  { header: "TO", value: (message) => handleOf(message.receivedBy) },
  { header: "CONTENT", value: (message) => summarizeContent(message.content) },
];

export const list = {
  options: {
    platform: { type: "string" },
    direction: { type: "string" },
    order: { type: "string" },
    "order-by": { type: "string" },
    space: { type: "string" },
    resource: { type: "string" },
    "perspective-user": { type: "string" },
    "created-since": { type: "string" },
    "created-before": { type: "string" },
    "updated-since": { type: "string" },
    "updated-before": { type: "string" },
    "exclude-content-types": { type: "string" },
    "page-size": { type: "string" },
    "page-token": { type: "string" },
    limit: { type: "string" },
  } as const satisfies ParseArgsOptionsConfig,

  async run({ client, projectId, flags, out }: CommandContext): Promise<void> {
    const limit = flags.limit ? Number(flags.limit) : undefined;
    if (limit !== undefined && (Number.isNaN(limit) || limit <= 0)) {
      throw usageError("--limit must be a positive number.");
    }

    const collected: MessageRecord[] = [];
    let pageToken: string | undefined = flags["page-token"];
    let pages = 0;

    do {
      const page = await client.projects.listMessages({
        path: { id: projectId },
        query: {
          ...listQuery(flags),
          ...(pageToken ? { pageToken } : {}),
          ...(limit && !flags["page-size"] ? { pageSize: Math.min(limit, 200) } : {}),
        },
      });

      collected.push(...pageItems<MessageRecord>(page));
      pageToken = nextPageToken(page);
      pages += 1;
      if (limit && collected.length >= limit) break;
      if (pages >= 50) break;
    } while (pageToken);

    const rows = limit ? collected.slice(0, limit) : collected;
    out.data({ items: rows, count: rows.length, pages, nextPageToken: pageToken ?? null });
    out.table(rows, columns);
    if (!flags.quiet) out.info(`${rows.length} message(s)`);
  },
};

export const get = {
  options: {} as const satisfies ParseArgsOptionsConfig,

  async run({ client, projectId, positionals, out }: CommandContext): Promise<void> {
    const messageId = positionals[0];
    if (!messageId) throw usageError("Usage: photon-msg messages get <messageId>");

    const message = (await client.projects.getMessage({
      path: { id: projectId, messageId },
    })) as unknown as MessageRecord;

    out.data(message);
    out.heading(`message ${message.id}`);
    out.keyValue([
      ["platform", message.platform],
      ["direction", message.direction],
      ["status", message.status],
      ["created", formatTime(message.createdAt)],
      ["space", message.space?.id],
      ["from", `${handleOf(message.sentBy) || "—"} (${message.sentBy?.kind ?? "?"})`],
      ["to", `${handleOf(message.receivedBy) || "—"} (${message.receivedBy?.kind ?? "outbound"})`],
      ["content", summarizeContent(message.content)],
    ]);
  },
};

export const watch = {
  options: {
    platform: { type: "string" },
    space: { type: "string" },
    direction: { type: "string" },
    interval: { type: "string" },
    for: { type: "string" },
    since: { type: "string" },
  } as const satisfies ParseArgsOptionsConfig,

  async run({ client, projectId, flags, out }: CommandContext): Promise<void> {
    const intervalMs = Math.max(1, Number(flags.interval ?? 2)) * 1000;
    const durationMs = flags.for ? Number(flags.for) * 1000 : 0;
    const createdSince = flags.since ? new Date(flags.since).toISOString() : new Date().toISOString();
    const deadline = durationMs ? Date.now() + durationMs : Number.POSITIVE_INFINITY;

    const seen = new Set<string>();
    if (!flags.quiet) out.info(`watching from ${createdSince}, every ${intervalMs / 1000}s (ctrl-c to stop)`);

    while (Date.now() < deadline) {
      let pageToken: string | undefined;
      do {
        const page = await client.projects.listMessages({
          path: { id: projectId },
          query: {
            createdSince,
            direction: flags.direction ?? "received",
            order: "asc",
            pageSize: 100,
            ...(flags.platform ? { platform: flags.platform } : {}),
            ...(flags.space ? { spaceId: flags.space } : {}),
            ...(pageToken ? { pageToken } : {}),
          },
        });

        for (const message of pageItems<MessageRecord>(page)) {
          if (seen.has(message.id)) continue;
          seen.add(message.id);
          // JSON lines so the output can be piped straight into another process.
          process.stdout.write(`${JSON.stringify(message)}\n`);
        }
        pageToken = nextPageToken(page);
      } while (pageToken);

      await sleep(intervalMs);
    }
  },
};
