import { test } from "node:test";
import assert from "node:assert/strict";
import type { Photon } from "@photon-ai/api";

import { normalizeHandle, inferPlatform, resolveTarget, resolveUser } from "../src/target.js";
import type { UserRecord } from "../src/types.js";

interface FakeOverrides {
  createOrGetUser?: (input: { path: { id: string }; body: { handle: string; platform: string } }) => Promise<UserRecord>;
  getUser?: (input: { path: { id: string; userId: string } }) => Promise<UserRecord>;
  createOrGetSpace?: (input: {
    body: { participantIds: string[]; platform: string };
    headers: Record<string, string>;
  }) => Promise<{ id: string; kind: string }>;
}

const fakeClient = (overrides: FakeOverrides = {}): Photon =>
  ({
    projects: {
      createOrGetUser: async ({ path, body }: { path: { id: string }; body: { handle: string; platform: string } }) => ({
        id: `pho_usr_${body.handle.replace(/\D/g, "") || "email"}`,
        handle: body.handle,
        kind: "agent",
        platform: body.platform,
        pathId: path.id,
      }),
      getUser: async ({ path }: { path: { id: string; userId: string } }) => ({
        id: path.userId,
        handle: "+15550000000",
        kind: "human",
        platform: "imessage",
      }),
      createOrGetSpace: async ({ body, headers }: { body: { participantIds: string[] }; headers: Record<string, string> }) => ({
        id: "pho_spc_1",
        kind: "direct",
        participants: body.participantIds,
        key: headers["idempotency-key"],
      }),
      ...overrides,
    },
  }) as unknown as Photon;

test("normalizeHandle accepts common phone formats", () => {
  assert.equal(normalizeHandle("+1 (669) 837-8729"), "+16698378729");
  assert.equal(normalizeHandle("6698378729"), "+16698378729");
  assert.equal(normalizeHandle("+447700900123"), "+447700900123");
  assert.equal(normalizeHandle("person@example.com"), "person@example.com");
});

test("inferPlatform picks email for addresses and defaults to imessage", () => {
  assert.equal(inferPlatform("person@example.com"), "email");
  assert.equal(inferPlatform("+15551234567"), "imessage");
  assert.equal(inferPlatform("+15551234567", "sms"), "sms");
  assert.equal(inferPlatform(undefined), "imessage");
});

test("resolveUser returns an existing user for a pho_usr_ id", async () => {
  const user = await resolveUser({
    client: fakeClient(),
    projectId: "p",
    platform: "imessage",
    input: "pho_usr_abc123",
  });
  assert.equal(user.id, "pho_usr_abc123");
});

test("resolveUser resolves a handle through createOrGetUser", async () => {
  const user = await resolveUser({
    client: fakeClient(),
    projectId: "p",
    platform: "imessage",
    input: "+1 669 837 8729",
  });
  assert.equal(user.handle, "+16698378729");
});

test("resolveTarget creates a direct space from sender and peer", async () => {
  const target = await resolveTarget({
    client: fakeClient(),
    projectId: "proj",
    flags: { to: "+15551234567", as: "+15559876543" },
  });
  assert.equal(target.spaceId, "pho_spc_1");
  assert.match(target.senderId, /^pho_usr_/);
  assert.match(target.peerId ?? "", /^pho_usr_/);
});

test("resolveTarget reuses a space when --space is given", async () => {
  let spaceCalls = 0;
  const client = fakeClient({
    createOrGetSpace: async () => {
      spaceCalls += 1;
      return { id: "should-not-happen", kind: "direct" };
    },
  });
  const target = await resolveTarget({
    client,
    projectId: "proj",
    flags: { space: "pho_spc_existing", as: "+15559876543" },
  });
  assert.equal(target.spaceId, "pho_spc_existing");
  assert.equal(spaceCalls, 0);
});

test("resolveTarget falls back to the configured agent handle", async () => {
  const target = await resolveTarget({
    client: fakeClient(),
    projectId: "proj",
    flags: { to: "+15551234567" },
    defaultHandle: "+15550001111",
  });
  assert.ok(target.senderId);
});

test("a missing sender is a usage error", async () => {
  await assert.rejects(
    resolveTarget({ client: fakeClient(), projectId: "p", flags: { to: "+15551234567" } }),
    /No sender/,
  );
});

test("a missing destination is a usage error", async () => {
  await assert.rejects(
    resolveTarget({ client: fakeClient(), projectId: "p", flags: { as: "+15551234567" } }),
    /No destination/,
  );
});
