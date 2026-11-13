/**
 * `line` — iMessage shared-line assignments.
 *
 * A pooled shared line is the free way to get a sending identity: assign the
 * human's handle to a line, and the line may reply once that human has written
 * to it. Assignment is idempotent per handle when you reuse the key.
 */

import { pageItems } from "../client.js";
import { formatTime } from "../output.js";
import { usageError } from "../errors.js";
import { normalizeHandle } from "../target.js";

const columns = [
  { header: "ASSIGNMENT", value: (a) => a.assignmentId },
  { header: "HANDLE", value: (a) => a.handle },
  { header: "LINE", value: (a) => a.assignedPhoneNumber },
  { header: "CREATED", value: (a) => formatTime(a.createdAt) },
  { header: "RELEASED", value: (a) => formatTime(a.releasedAt) },
];

export const assign = {
  options: {
    handle: { type: "string" },
    email: { type: "string" },
    "first-name": { type: "string" },
    "last-name": { type: "string" },
    "idempotency-key": { type: "string" },
  },

  async run(ctx) {
    const { client, projectId, flags, positionals, out, dryRun } = ctx;
    const raw = flags.handle ?? positionals[0];
    if (!raw) throw usageError("Usage: photon-msg line assign --handle <+15551234567> [--email you@example.com]");

    const handle = normalizeHandle(raw);
    const idempotencyKey = flags["idempotency-key"] ?? `photon-msg:line-assign:${handle}`;

    if (dryRun) {
      out.data({ dryRun: true, handle, idempotencyKey });
      out.line(`would assign a shared line for ${handle}`);
      return;
    }

    const assignment = await client.projects.platforms.imessage.assignments.create({
      path: { id: projectId },
      headers: { "idempotency-key": idempotencyKey },
      body: {
        handle,
        ...(flags.email ? { email: flags.email } : {}),
        ...(flags["first-name"] ? { firstName: flags["first-name"] } : {}),
        ...(flags["last-name"] ? { lastName: flags["last-name"] } : {}),
      },
    });

    out.data(assignment);
    out.success(`line ${assignment.assignedPhoneNumber} assigned for ${assignment.handle}`);
    out.info(`assignment ${assignment.assignmentId}`);
    out.info("this line can reply after that handle writes to it; it cannot start the conversation");
  },
};

export const list = {
  options: {
    "include-released": { type: "boolean" },
    "page-size": { type: "string" },
    "page-token": { type: "string" },
  },

  async run(ctx) {
    const { client, projectId, flags, out } = ctx;
    const query = {};
    if (flags["include-released"]) query.includeReleased = true;
    if (flags["page-size"]) query.pageSize = Number(flags["page-size"]);
    if (flags["page-token"]) query.pageToken = flags["page-token"];

    const page = await client.projects.platforms.imessage.assignments.list({
      path: { id: projectId },
      query,
    });
    const items = pageItems(page);

    out.data({ items, count: items.length, nextPageToken: page?.nextPageToken ?? null });
    out.table(items, columns);
    if (!flags.quiet) out.info(`${items.length} assignment(s)`);
  },
};

export const get = {
  options: {},
  async run(ctx) {
    const { client, projectId, positionals, out } = ctx;
    const assignmentId = positionals[0];
    if (!assignmentId) throw usageError("Usage: photon-msg line get <assignmentId>");

    const assignment = await client.projects.platforms.imessage.assignments.get({
      path: { id: projectId, assignmentId },
    });

    out.data(assignment);
    out.heading(`assignment ${assignment.assignmentId}`);
    out.keyValue([
      ["handle", assignment.handle],
      ["line", assignment.assignedPhoneNumber],
      ["created", formatTime(assignment.createdAt)],
      ["released", formatTime(assignment.releasedAt)],
    ]);
  },
};

export const release = {
  options: {},
  async run(ctx) {
    const { client, projectId, positionals, out, dryRun } = ctx;
    const assignmentId = positionals[0];
    if (!assignmentId) throw usageError("Usage: photon-msg line release <assignmentId>");

    if (dryRun) {
      out.data({ dryRun: true, assignmentId });
      out.line(`would release ${assignmentId}`);
      return;
    }

    const released = await client.projects.platforms.imessage.assignments.release({
      path: { id: projectId, assignmentId },
    });

    out.data(released ?? { assignmentId, released: true });
    out.success(`released ${assignmentId}`);
  },
};
