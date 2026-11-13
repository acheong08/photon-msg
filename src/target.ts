/**
 * Resolves who is sending and where, turning friendly handles into the IDs the
 * API requires.
 *
 * Two addressing styles are supported:
 *   --space <spaceId> --as <sender>   reply into an existing conversation
 *   --to <handle> --as <sender>       start (or reuse) a direct conversation
 *
 * The second relies on `createOrGetSpace`, so it is idempotent for a given pair
 * of participants.
 */

import type { Photon } from "@photon-ai/api";
import { usageError } from "./errors.js";
import type { Flags, ResolvedTarget, UserRecord } from "./types.js";

const USER_ID = /^pho_usr_[0-9a-z]+$/i;

/** Infers a platform from a handle when --platform is absent. */
export function inferPlatform(handle: string | undefined, fallback = "imessage"): string {
  if (!handle) return fallback;
  if (handle.includes("@")) return "email";
  return fallback;
}

/** Normalizes a phone number to E.164 when it looks like one; otherwise passes it through. */
export function normalizeHandle(handle: string): string {
  const value = handle.trim();
  const digits = value.replace(/[^\d+]/g, "");
  if (/^\+?\d{7,15}$/.test(digits)) {
    return digits.startsWith("+") ? digits : `+1${digits}`;
  }
  return value;
}

export interface ResolveUserInput {
  client: Photon;
  projectId: string;
  platform: string;
  input: string;
  normalize?: boolean;
}

/** Accepts a Photon user ID or a handle and returns the user record. */
export async function resolveUser({
  client,
  projectId,
  platform,
  input,
  normalize = true,
}: ResolveUserInput): Promise<UserRecord> {
  if (USER_ID.test(input)) {
    const user = await client.projects.getUser({ path: { id: projectId, userId: input } });
    return user as unknown as UserRecord;
  }
  const handle = normalize ? normalizeHandle(input) : input;
  const user = await client.projects.createOrGetUser({
    path: { id: projectId },
    body: { handle, platform },
  });
  return user as unknown as UserRecord;
}

export interface ResolveTargetInput {
  client: Photon;
  projectId: string;
  flags: Flags;
  defaultHandle?: string | undefined;
}

export async function resolveTarget({
  client,
  projectId,
  flags,
  defaultHandle,
}: ResolveTargetInput): Promise<ResolvedTarget> {
  const platform = flags.platform ?? inferPlatform(flags.to);

  const senderInput = flags.as ?? defaultHandle;
  if (!senderInput) {
    throw usageError(
      "No sender. Pass --as <agent handle or user ID>, or set PHOTON_AGENT_HANDLE.",
      "The sender must be an agent that belongs to this project (for example the number assigned to a shared line).",
    );
  }

  const sender = await resolveUser({ client, projectId, platform, input: senderInput });
  const senderId = String(sender.id);
  const senderHandle = typeof sender.handle === "string" ? sender.handle : undefined;

  if (flags.space) {
    return { spaceId: flags.space, senderId, ...(senderHandle ? { senderHandle } : {}) };
  }

  if (!flags.to) {
    throw usageError(
      "No destination. Pass --to <handle> to start a direct conversation, or --space <spaceId> to use an existing one.",
    );
  }

  const peer = await resolveUser({ client, projectId, platform, input: flags.to });
  const peerId = String(peer.id);

  const space = await client.projects.createOrGetSpace({
    path: { id: projectId },
    headers: {
      "idempotency-key": flags["idempotency-key"] ?? `photon-msg:space:${senderId}:${peerId}`,
    },
    body: { platform, participantIds: [senderId, peerId] },
  });

  return {
    spaceId: String(space.id),
    senderId,
    ...(senderHandle ? { senderHandle } : {}),
    peerId,
  };
}
