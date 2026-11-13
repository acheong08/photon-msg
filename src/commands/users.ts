/**
 * `users` — the people and agents inside a project.
 */

import type { ParseArgsOptionsConfig } from "node:util";

import { handleOf, nextPageToken, pageItems } from "../client.js";
import { formatTime, type TableColumn } from "../output.js";
import { usageError } from "../errors.js";
import { normalizeHandle } from "../target.js";
import type { CommandContext, UserRecord } from "../types.js";

export const list = {
  options: {
    platform: { type: "string" },
    "page-size": { type: "string" },
    "page-token": { type: "string" },
  } as const satisfies ParseArgsOptionsConfig,

  async run({ client, projectId, flags, out }: CommandContext): Promise<void> {
    const query: Record<string, string | number> = {};
    if (flags.platform) query.platform = flags.platform;
    if (flags["page-size"]) query.pageSize = Number(flags["page-size"]);
    if (flags["page-token"]) query.pageToken = flags["page-token"];

    const page = await client.projects.listUsers({ path: { id: projectId }, query });
    const items = pageItems<UserRecord>(page);

    const columns: Array<TableColumn<UserRecord>> = [
      { header: "ID", value: (user) => user.id },
      { header: "PLATFORM", value: (user) => user.platform },
      { header: "KIND", value: (user) => user.kind },
      { header: "TYPE", value: (user) => user.type ?? "" },
      { header: "HANDLE", value: (user) => handleOf(user) },
      { header: "CREATED", value: (user) => formatTime(user.createdAt) },
    ];

    out.data({ items, count: items.length, nextPageToken: nextPageToken(page) ?? null });
    out.table(items, columns);
    if (!flags.quiet) out.info(`${items.length} user(s)`);
  },
};

export const get = {
  options: {} as const satisfies ParseArgsOptionsConfig,

  async run({ client, projectId, positionals, out }: CommandContext): Promise<void> {
    const userId = positionals[0];
    if (!userId) throw usageError("Usage: photon-msg users get <userId>");

    const user = (await client.projects.getUser({
      path: { id: projectId, userId },
    })) as unknown as UserRecord;

    out.data(user);
    out.heading(`user ${user.id}`);
    out.keyValue([
      ["platform", user.platform],
      ["kind", user.kind],
      ["type", user.type ?? ""],
      ["handle", handleOf(user)],
      ["created", formatTime(user.createdAt)],
    ]);
  },
};

export const ensure = {
  options: {
    handle: { type: "string" },
    platform: { type: "string" },
  } as const satisfies ParseArgsOptionsConfig,

  async run({ client, projectId, flags, positionals, out, dryRun }: CommandContext): Promise<void> {
    const raw = flags.handle ?? positionals[0];
    if (!raw) throw usageError("Usage: photon-msg users ensure --handle <handle> [--platform imessage]");

    const platform = flags.platform ?? (raw.includes("@") ? "email" : "imessage");
    const handle = normalizeHandle(raw);

    if (dryRun) {
      out.data({ dryRun: true, platform, handle });
      out.line(`would resolve ${handle} on ${platform}`);
      return;
    }

    const user = (await client.projects.createOrGetUser({
      path: { id: projectId },
      body: { handle, platform },
    })) as unknown as UserRecord;

    out.data(user);
    out.success(`${user.id} ${handleOf(user)} (${user.kind}, ${user.platform})`);
  },
};
