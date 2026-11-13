/**
 * `users` — the people and agents inside a project.
 */

import { pageItems, handleOf } from "../client.js";
import { formatTime } from "../output.js";
import { usageError } from "../errors.js";
import { normalizeHandle } from "../target.js";

export const list = {
  options: {
    platform: { type: "string" },
    "page-size": { type: "string" },
    "page-token": { type: "string" },
  },

  async run(ctx) {
    const { client, projectId, flags, out } = ctx;
    const query = {};
    if (flags.platform) query.platform = flags.platform;
    if (flags["page-size"]) query.pageSize = Number(flags["page-size"]);
    if (flags["page-token"]) query.pageToken = flags["page-token"];

    const page = await client.projects.listUsers({ path: { id: projectId }, query });
    const items = pageItems(page);

    out.data({ items, count: items.length, nextPageToken: page?.nextPageToken ?? null });
    out.table(items, [
      { header: "ID", value: (u) => u.id },
      { header: "PLATFORM", value: (u) => u.platform },
      { header: "KIND", value: (u) => u.kind },
      { header: "TYPE", value: (u) => u.type ?? "" },
      { header: "HANDLE", value: (u) => handleOf(u) },
      { header: "CREATED", value: (u) => formatTime(u.createdAt) },
    ]);
    if (!flags.quiet) out.info(`${items.length} user(s)`);
  },
};

export const get = {
  options: {},
  async run(ctx) {
    const { client, projectId, positionals, out } = ctx;
    const userId = positionals[0];
    if (!userId) throw usageError("Usage: photon-msg users get <userId>");

    const user = await client.projects.getUser({ path: { id: projectId, userId } });
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
  },

  async run(ctx) {
    const { client, projectId, flags, positionals, out, dryRun } = ctx;
    const raw = flags.handle ?? positionals[0];
    if (!raw) throw usageError("Usage: photon-msg users ensure --handle <handle> [--platform imessage]");

    const platform = flags.platform ?? (raw.includes("@") ? "email" : "imessage");
    const handle = normalizeHandle(raw);

    if (dryRun) {
      out.data({ dryRun: true, platform, handle });
      out.line(`would resolve ${handle} on ${platform}`);
      return;
    }

    const user = await client.projects.createOrGetUser({
      path: { id: projectId },
      body: { handle, platform },
    });

    out.data(user);
    out.success(`${user.id} ${handleOf(user)} (${user.kind}, ${user.platform})`);
  },
};
