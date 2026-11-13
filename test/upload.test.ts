import { test } from "node:test";
import assert from "node:assert/strict";

import { buildMultipartRelated, contentTypeFor, createUploader } from "../src/upload.js";

const decoder = new TextDecoder();

/** Builds a fetch stub with the same signature as the global. */
const stubFetch = (
  handler: (url: string, init: RequestInit) => Promise<Response>,
): typeof globalThis.fetch => handler as unknown as typeof globalThis.fetch;

test("contentTypeFor maps common extensions", () => {
  assert.equal(contentTypeFor("a.png"), "image/png");
  assert.equal(contentTypeFor("a.JPG"), "image/jpeg");
  assert.equal(contentTypeFor("memo.m4a"), "audio/mp4");
  assert.equal(contentTypeFor("unknown.zzz"), "application/octet-stream");
});

test("multipart body has exactly two parts and ends with the boundary", () => {
  const bytes = new TextEncoder().encode("PNGDATA");
  const body = buildMultipartRelated({
    descriptor: { contentType: "image/png", sizeBytes: 7, filename: "a.png" },
    bytes,
    contentType: "image/png",
    boundary: "BOUND",
  });
  const text = decoder.decode(body);

  assert.equal((text.match(/--BOUND\r\n/g) ?? []).length, 2);
  assert.ok(text.includes('"filename":"a.png"'));
  assert.ok(text.includes("Content-Type: image/png"));
  assert.ok(text.endsWith("--BOUND--\r\n"));
  assert.ok(text.includes("PNGDATA"));
  // The API rejects unsupported part headers, so none may be added.
  assert.ok(!text.includes("Content-Transfer-Encoding"));
});

test("multipart body preserves raw bytes", () => {
  const bytes = new Uint8Array([0, 1, 2, 255]);
  const body = buildMultipartRelated({
    descriptor: { contentType: "application/octet-stream", sizeBytes: 4 },
    bytes,
    contentType: "application/octet-stream",
    boundary: "B",
  });
  const index = body.indexOf(0);
  assert.ok(index > 0);
  assert.deepEqual([...body.slice(index, index + 4)], [0, 1, 2, 255]);
});

test("uploader posts to the attachments endpoint and returns the id", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = stubFetch(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "pho_att_123" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });

  const upload = createUploader({
    apiKey: "key_test",
    projectId: "pho_prj_1",
    baseUrl: "https://api.example.test",
    fetch: fetchImpl,
  });

  const id = await upload("test/fixtures/pixel.png");
  assert.equal(id, "pho_att_123");
  assert.equal(calls.length, 1);

  const call = calls[0];
  assert.ok(call);
  assert.match(call.url, /\/v1\/projects\/pho_prj_1\/attachments$/);
  assert.equal(call.init.method, "POST");

  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer key_test");
  assert.match(headers["content-type"] ?? "", /multipart\/related; boundary=/);
  assert.ok(!(headers["content-type"] ?? "").includes("type="));
  assert.equal(headers["content-length"], String((call.init.body as Uint8Array).length));
});

test("uploader surfaces API errors with the problem detail", async () => {
  const fetchImpl = stubFetch(async () =>
    new Response(JSON.stringify({ code: "IMAGE_TOO_LARGE", detail: "too big" }), {
      status: 422,
      headers: { "content-type": "application/json" },
    }),
  );

  const upload = createUploader({ apiKey: "k", projectId: "p", fetch: fetchImpl });
  await assert.rejects(upload("test/fixtures/pixel.png"), /too big/);
});

test("uploader rejects a missing file with a usage error", async () => {
  const fetchImpl = stubFetch(async () => new Response(""));
  const upload = createUploader({ apiKey: "k", projectId: "p", fetch: fetchImpl });
  await assert.rejects(upload("does/not/exist.png"), /Could not read/);
});
