/**
 * `messages` — list, fetch, and follow messages.
 */

import { setTimeout as sleep } from "node:timers/promises";
import { pageItems, handleOf } from "../client.js";
import { formatTime, summarizeContent } from "../output.js";
import { usageError } from "../errors.js";

const listQuery = (flags) => {
  const query = {};
  const map = {
    platform: "platform",
    direction: "direction",
    order: "order",
    "order-by": "orderBy",
    space: "spaceId",
    resource: "resourceId",
    "perspective-user": "perspectiveUserId",
    "created-since": "createdSince",
    "created-before": "createdBefore",
    "updated-since": "updatedSince",
    "updated-before": "updatedBefore",
    "exclude-content-types": "excludeContentTypes",
    "page-token": "pageToken",
  };
  for (const [flag, key] of Object.entries(map)) {
    if (flags[flag] !== undefined) query[key] = flags[flag];
  }
  if (flags["page-size"] !== undefined) query.pageSize = Number(flags["page-size"]);
  return query;
};

/** Columns shared by the list and get views. */
const columns = [
  { header: "ID", value: (m) => m.id },
  { header: "TIME", value: (m) => formatTime(m.createdAt) },
  { header: "PLATFORM", value: (m) => m.platform },
  { header: "DIRECTION", value: (m) => m.direction },
  { header: "STATUS", value: (m) => m.status },
  { header: "FROM", value: (m) => handleOf(m.sentBy) },
  { header: "TO", value: (m) => handleOf(m.receivedBy) },
  { header: "CONTENT", value: (m) => summarizeContent(m.content) },
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
  },

  async run(ctx) {
    const { client, projectId, flags, out } = ctx;
    const limit = flags.limit ? Number(flags.limit) : undefined;
    if (limit !== undefined && (Number.isNaN(limit) || limit <= 0)) {
      throw usageError("--limit must be a positive number.");
    }

    const collected = [];
    let pageToken = flags["page-token"];
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
      const items = pageItems(page);
      collected.push(...items);
      pageToken = page?.nextPageToken;
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
  options: {},
  async run(ctx) {
    const { client, projectId, positionals, out } = ctx;
    const messageId = positionals[0];
    if (!messageId) throw usageError("Usage: photon-msg messages get <messageId>");

    const message = await client.projects.getMessage({ path: { id: projectId, messageId } });
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
    "since": { type: "string" },
  },

  async run(ctx) {
    const { client, projectId, flags, out } = ctx;
    const intervalMs = Math.max(1, Number(flags.interval ?? 2)) * 1000;
    const durationMs = flags.for ? Number(flags.for) * 1000 : 0;
    const createdSince = flags.since ? new Date(flags.since).toISOString() : new Date().toISOString();
    const deadline = durationMs ? Date.now() + durationMs : Infinity;

    const seen = new Set();
    if (!flags.quiet) out.info(`watching from ${createdSince}, every ${intervalMs / 1000}s (ctrl-c to stop)`);

    while (Date.now() < deadline) {
      let pageToken;
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
        for (const message of pageItems(page)) {
          if (seen.has(message.id)) continue;
          seen.add(message.id);
          // JSON lines so the output can be piped straight into another process.
          process.stdout.write(`${JSON.stringify(message)}\n`);
        }
        pageToken = page?.nextPageToken;
      } while (pageToken);

      await sleep(intervalMs);
    }
  },
};
