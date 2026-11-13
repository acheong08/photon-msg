/**
 * Resolves who is sending and where, turning friendly handles into the IDs the
 * API requires.
 *
 * Two addressing styles are supported:
 *   --space <spaceId> --as <sender>   reply into an existing conversation
 *   --to <handle> --as <sender>       start (or reuse) a direct conversation
 *
 * The second style relies on `createOrGetSpace`, so it is idempotent for a given
 * pair of participants.
 */

import { usageError } from "./errors.js";

const USER_ID = /^pho_usr_[0-9a-z]+$/i;

/** Infers a platform from a handle when --platform is absent. */
export function inferPlatform(handle, fallback = "imessage") {
  if (!handle) return fallback;
  if (String(handle).includes("@")) return "email";
  if (/^\+?\d[\d\s().-]{5,}$/.test(String(handle))) return fallback;
  return fallback;
}

/** Normalizes a phone number to E.164 when it looks like one; otherwise passes it through. */
export function normalizeHandle(handle) {
  const value = String(handle).trim();
  const digits = value.replace(/[^\d+]/g, "");
  if (/^\+?\d{7,15}$/.test(digits)) {
    return digits.startsWith("+") ? digits : `+1${digits}`;
  }
  return value;
}

/**
 * @param {{
 *   client: any,
 *   projectId: string,
 *   flags: Record<string, any>,
 *   defaultHandle?: string,
 * }} input
 * @returns {Promise<{spaceId: string, senderId: string, senderHandle?: string, peerId?: string}>}
 */
export async function resolveTarget({ client, projectId, flags, defaultHandle }) {
  const platform = flags.platform ?? inferPlatform(flags.to);

  const senderInput = flags.as ?? defaultHandle;
  if (!senderInput) {
    throw usageError(
      "No sender. Pass --as <agent handle or user ID>, or set PHOTON_AGENT_HANDLE.",
      "The sender must be an agent that belongs to this project (for example the number assigned to a shared line).",
    );
  }

  const sender = await resolveUser({ client, projectId, platform, input: senderInput });

  if (flags.space) {
    return { spaceId: flags.space, senderId: sender.id, senderHandle: sender.handle };
  }

  if (!flags.to) {
    throw usageError("No destination. Pass --to <handle> to start a direct conversation, or --space <spaceId> to use an existing one.");
  }

  const peer = await resolveUser({ client, projectId, platform, input: flags.to, normalize: true });

  const space = await client.projects.createOrGetSpace({
    path: { id: projectId },
    headers: { "idempotency-key": flags["idempotency-key"] ?? `photon-msg:space:${sender.id}:${peer.id}` },
    body: { platform, participantIds: [sender.id, peer.id] },
  });

  return { spaceId: space.id, senderId: sender.id, senderHandle: sender.handle, peerId: peer.id };
}

/**
 * Accepts a Photon user ID or a handle and returns a User.
 * @param {{client: any, projectId: string, platform: string, input: string, normalize?: boolean}} input
 */
export async function resolveUser({ client, projectId, platform, input, normalize = true }) {
  if (USER_ID.test(input)) {
    return client.projects.getUser({ path: { id: projectId, userId: input } });
  }
  const handle = normalize ? normalizeHandle(input) : input;
  return client.projects.createOrGetUser({
    path: { id: projectId },
    body: { handle, platform },
  });
}
