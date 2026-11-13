/**
 * Attachment upload.
 *
 * The endpoint takes `multipart/related` with exactly two parts: a JSON
 * descriptor followed by the raw bytes. We talk to it with fetch directly rather
 * than through the SDK, because the SDK's upload method expects a
 * pre-serialized body and would otherwise fight us over the content type.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { CliError, EXIT, usageError, type ProblemBody } from "./errors.js";
import type { Uploader } from "./types.js";

const DEFAULT_BASE_URL = "https://api.photon.codes";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  txt: "text/plain",
};

/** Best-effort content type from a filename extension. */
export function contentTypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
}

export interface MultipartInput {
  descriptor: Record<string, unknown>;
  bytes: Uint8Array;
  contentType: string;
  boundary: string;
}

/**
 * Builds the `multipart/related` body by hand so the framing is exactly what the
 * API documents: two parts, no extra headers. (The API rejects unsupported
 * content-type parameters and part headers, which is why nothing else is added.)
 */
export function buildMultipartRelated({
  descriptor,
  bytes,
  contentType,
  boundary,
}: MultipartInput): Uint8Array {
  const encoder = new TextEncoder();
  const head =
    `--${boundary}\r\n` +
    "Content-Type: application/json\r\n" +
    "\r\n" +
    `${JSON.stringify(descriptor)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${contentType}\r\n` +
    "\r\n";
  const tail = `\r\n--${boundary}--\r\n`;

  const headBytes = encoder.encode(head);
  const tailBytes = encoder.encode(tail);
  const body = new Uint8Array(headBytes.length + bytes.length + tailBytes.length);
  body.set(headBytes, 0);
  body.set(bytes, headBytes.length);
  body.set(tailBytes, headBytes.length + bytes.length);
  return body;
}

interface LoadedSource {
  bytes: Uint8Array;
  filename: string;
}

/** Loads bytes from a local path or an http(s) URL. */
async function loadSource(source: string, fetchImpl: typeof globalThis.fetch): Promise<LoadedSource> {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetchImpl(source);
    if (!response.ok) {
      throw new CliError(`Could not download ${source}: HTTP ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, filename: basename(new URL(source).pathname) || "download" };
  }
  try {
    const bytes = new Uint8Array(await readFile(source));
    return { bytes, filename: basename(source) };
  } catch (error) {
    throw usageError(`Could not read ${source}: ${(error as Error).message}`);
  }
}

export interface UploaderOptions {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

/** Creates an uploader bound to one project. Returns an attachment ID. */
export function createUploader({
  apiKey,
  projectId,
  baseUrl = DEFAULT_BASE_URL,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs,
}: UploaderOptions): Uploader {
  return async function upload(source, { contentType } = {}): Promise<string> {
    const { bytes, filename } = await loadSource(source, fetchImpl);
    if (bytes.length === 0) throw usageError(`${source} is empty.`);

    const resolvedType = contentType ?? contentTypeFor(filename);
    const boundary = `photonmsg${randomUUID().replaceAll("-", "")}`;
    const descriptor = { contentType: resolvedType, sizeBytes: bytes.length, filename };
    const body = buildMultipartRelated({ descriptor, bytes, contentType: resolvedType, boundary });

    const url = new URL(`/v1/projects/${projectId}/attachments`, baseUrl).toString();
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": `multipart/related; boundary=${boundary}`,
        "content-length": String(body.length),
        "idempotency-key": `photon-msg:upload:${randomUUID()}`,
      },
      body,
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });

    const text = await response.text();
    let payload: ProblemBody & { id?: string; attachmentId?: string; attachment?: { id?: string } };
    try {
      payload = text ? (JSON.parse(text) as typeof payload) : {};
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      const detail = payload.detail ?? payload.title ?? text.slice(0, 200);
      throw new CliError(`Attachment upload failed (HTTP ${response.status}): ${detail}`, {
        exitCode: response.status === 401 ? EXIT.AUTH : response.status === 403 ? EXIT.FORBIDDEN : EXIT.FAILURE,
        ...(payload.code ? { code: payload.code } : {}),
      });
    }

    const id = payload.id ?? payload.attachmentId ?? payload.attachment?.id;
    if (!id) throw new CliError("Upload succeeded but the response carried no attachment ID.");
    return id;
  };
}
