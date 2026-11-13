/**
 * Shared types for the CLI.
 *
 * Payload shapes come from the SDK rather than being re-declared, so the CLI
 * fails to compile if the API contract changes underneath it.
 */

import type { ParseArgsOptionsConfig } from "node:util";
import type { Photon, SendContent } from "@photon-ai/api";
import type { Output } from "./output.js";
import type { Config } from "./config.js";

/** Uploads a local path or URL and resolves to an attachment ID. */
export type Uploader = (source: string, options?: { contentType?: string }) => Promise<string>;

/** Looks up users by Photon ID; used to build participant snapshots. */
export type UserLookup = (ids: string[]) => Promise<UserRecord[]>;

/** The subset of a Photon User the CLI relies on. */
export interface UserRecord {
  id: string;
  handle?: string;
  kind?: string;
  type?: string;
  platform?: string;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * Parsed flags. `parseArgs` yields `string | boolean | (string|boolean)[]`, so
 * array-capable options are typed as `string | string[]` and normalized by
 * `toArray` at the call site.
 */
export interface Flags {
  // global
  help?: boolean;
  version?: boolean;
  json?: boolean;
  color?: boolean;
  "api-key"?: string;
  project?: string;
  "base-url"?: string;
  timeout?: string;
  "dry-run"?: boolean;
  quiet?: boolean;

  // targeting
  to?: string;
  space?: string;
  as?: string;
  platform?: string;

  // content
  text?: string | string[];
  "text-file"?: string;
  format?: string;
  image?: string | string[];
  file?: string | string[];
  caption?: string;
  voice?: string;
  reaction?: string;
  "reaction-action"?: string;
  poll?: string;
  "poll-option"?: string | string[];
  "poll-mode"?: string;
  edit?: string;
  delete?: string;
  reason?: string;
  read?: boolean;
  typing?: string;
  "participants-add"?: string | string[];
  "participants-remove"?: string | string[];
  group?: boolean;
  "reply-to"?: string;
  "idempotency-key"?: string;
  subject?: string;
  cc?: string | string[];
  bcc?: string | string[];

  // list / filter
  direction?: string;
  order?: string;
  "order-by"?: string;
  resource?: string;
  "perspective-user"?: string;
  "created-since"?: string;
  "created-before"?: string;
  "updated-since"?: string;
  "updated-before"?: string;
  "exclude-content-types"?: string;
  "page-size"?: string;
  "page-token"?: string;
  limit?: string;
  interval?: string;
  for?: string;
  since?: string;

  // spaces / users / lines
  participant?: string | string[];
  "participant-handle"?: string;
  handle?: string;
  email?: string;
  "first-name"?: string;
  "last-name"?: string;
  "include-released"?: boolean;

  // attachments
  "content-type"?: string;
  out?: string;

  // conversation state
  on?: boolean;
  off?: boolean;
}

/** Everything a command receives. `client` and `upload` are always present; in
 * dry-run they throw rather than silently doing nothing. */
export interface CommandContext {
  flags: Flags;
  positionals: string[];
  config: Config;
  projectId: string;
  client: Photon;
  upload: Uploader;
  out: Output;
  dryRun: boolean;
}

/** A command implementation. */
export interface Command {
  options: ParseArgsOptionsConfig;
  run(ctx: CommandContext): Promise<void>;
}

/** A resolved outbound payload, before it is addressed to a space. */
export interface BuiltMessage {
  content: SendContent;
  parentMessageId?: string;
  email?: EmailOptions;
}

/** Email-only options that travel alongside content. */
export interface EmailOptions {
  subject?: string;
  cc?: Array<{ address: string }>;
  bcc?: Array<{ address: string }>;
}

/** Resolved addressing for a send. */
export interface ResolvedTarget {
  spaceId: string;
  senderId: string;
  senderHandle?: string;
  peerId?: string;
}

/**
 * Display projections of API resources.
 *
 * The SDK models these as platform-specific unions; the CLI only reads the
 * fields that every platform shares, so these interfaces keep table and JSON
 * output typed without pretending to model each platform.
 */
export interface MessageRecord {
  id: string;
  platform?: string;
  direction?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  space?: { id: string; kind?: string; platform?: string };
  sentBy?: { id?: string; kind?: string; handle?: string };
  receivedBy?: { id?: string; kind?: string; handle?: string } | null;
  content?: SendContent;
  [key: string]: unknown;
}

export interface SpaceRecord {
  id: string;
  platform?: string;
  kind?: string;
  title?: string;
  name?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface AssignmentRecord {
  assignmentId: string;
  handle: string;
  assignedPhoneNumber: string;
  platform?: string;
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
  releasedAt?: string;
  [key: string]: unknown;
}

export interface AttachmentRecord {
  id: string;
  contentType?: string;
  filename?: string;
  sizeBytes?: number;
  createdAt?: string;
  [key: string]: unknown;
}
