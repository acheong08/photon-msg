/**
 * `attachments` — upload files and fetch the ones a message references.
 */

import { writeFile } from "node:fs/promises";
import { CliError, usageError } from "../errors.js";
import { formatTime } from "../output.js";

export const upload = {
  options: {
    "content-type": { type: "string" },
  },

  async run(ctx) {
    const { flags, positionals, out, upload: uploadFile, dryRun } = ctx;
    const source = positionals[0];
    if (!source) throw usageError("Usage: photon-msg attachments upload <path|url> [--content-type image/png]");

    if (dryRun) {
      out.data({ dryRun: true, source });
      out.line(`would upload ${source}`);
      return;
    }

    const attachmentId = await uploadFile(source, { contentType: flags["content-type"] });
    out.data({ attachmentId, source });
    out.success(`uploaded ${source} → ${attachmentId}`);
  },
};

export const get = {
  options: {},
  async run(ctx) {
    const { client, projectId, positionals, out } = ctx;
    const attachmentId = positionals[0];
    if (!attachmentId) throw usageError("Usage: photon-msg attachments get <attachmentId>");

    const attachment = await client.projects.getAttachment({
      path: { id: projectId, attachmentId },
    });

    out.data(attachment);
    out.heading(`attachment ${attachment.id ?? attachmentId}`);
    out.keyValue([
      ["content type", attachment.contentType],
      ["filename", attachment.filename ?? ""],
      ["bytes", attachment.sizeBytes ?? ""],
      ["created", formatTime(attachment.createdAt)],
    ]);
  },
};

export const download = {
  options: {
    out: { type: "string" },
  },

  async run(ctx) {
    const { client, projectId, flags, positionals, out } = ctx;
    const attachmentId = positionals[0];
    if (!attachmentId) throw usageError("Usage: photon-msg attachments download <attachmentId> --out ./file.png");

    const result = await client.projects.downloadAttachment({
      path: { id: projectId, attachmentId },
    });

    const bytes = await toBytes(result);
    const target = flags.out ?? `${attachmentId}.bin`;
    await writeFile(target, bytes);

    out.data({ attachmentId, path: target, bytes: bytes.length });
    out.success(`wrote ${bytes.length} bytes to ${target}`);
  },
};

/** Normalizes the SDK's download result into a Buffer. */
async function toBytes(result) {
  if (result instanceof Uint8Array) return Buffer.from(result);
  if (result instanceof ArrayBuffer) return Buffer.from(new Uint8Array(result));
  if (typeof Blob !== "undefined" && result instanceof Blob) {
    return Buffer.from(new Uint8Array(await result.arrayBuffer()));
  }
  if (result?.data) return toBytes(result.data);
  if (typeof result === "string") return Buffer.from(result);
  throw new CliError("Download returned an unexpected payload type.");
}
