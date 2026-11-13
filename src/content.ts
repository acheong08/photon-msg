/**
 * Turns CLI flags into a Photon `SendContent` payload.
 *
 * The API takes one polymorphic `content` object, which is how edits, unsends,
 * reactions, read receipts, typing indicators and poll votes travel: there is no
 * separate endpoint per action. This module is the single source of truth for
 * that mapping, and it stays pure by taking uploads and user lookups as injected
 * dependencies.
 */

import { readFileSync } from "node:fs";
import type {
  SendAttachmentContent,
  SendContent,
  SendContentPart,
  SendGroupContent,
  SendMessageDeleteContent,
  SendMessageReadContent,
  SendPollContent,
  SendReactionContent,
  SendSpaceParticipantsUpdateContent,
  SendSpaceTypingUpdateContent,
  SendTextContent,
  SendTextUpdateContent,
  SendVoiceContent,
  UserSnapshotInput,
} from "@photon-ai/api";

import { usageError } from "./errors.js";
import type { BuiltMessage, Flags, Uploader, UserLookup } from "./types.js";

/** Every content mode the CLI can build. */
export const MODES = [
  "text",
  "attachment",
  "voice",
  "reaction",
  "poll",
  "edit",
  "delete",
  "read",
  "typing",
  "participants",
  "group",
] as const;

export type ContentMode = (typeof MODES)[number];

const asArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const isSet = (value: unknown): boolean => value !== undefined && value !== null && value !== false;

/** Lists the content modes implied by the given flags. */
export function detectModes(flags: Flags): ContentMode[] {
  const modes: ContentMode[] = [];
  // An edit carries its replacement text, so --text belongs to the edit rather
  // than being a competing mode.
  const editing = isSet(flags.edit);
  if (!editing && (isSet(flags.text) || isSet(flags["text-file"]))) modes.push("text");
  if (asArray(flags.image).length > 0 || asArray(flags.file).length > 0) modes.push("attachment");
  if (isSet(flags.voice)) modes.push("voice");
  if (isSet(flags.reaction)) modes.push("reaction");
  if (isSet(flags.poll)) modes.push("poll");
  if (editing) modes.push("edit");
  if (isSet(flags.delete)) modes.push("delete");
  if (flags.read === true) modes.push("read");
  if (isSet(flags.typing)) modes.push("typing");
  if (asArray(flags["participants-add"]).length > 0 || asArray(flags["participants-remove"]).length > 0) {
    modes.push("participants");
  }
  if (flags.group === true) modes.push("group");
  return modes;
}

/** Reads text from a file, or stdin when the path is "-". */
export function readTextFile(path: string): string {
  try {
    return readFileSync(path === "-" ? 0 : path, "utf8");
  } catch (error) {
    throw usageError(`Could not read ${path === "-" ? "stdin" : path}: ${(error as Error).message}`);
  }
}

const normalizeFormat = (format: string | undefined): string => {
  if (!format) return "plain";
  const value = format.toLowerCase();
  if (value !== "plain" && value !== "markdown") {
    throw usageError(`--format must be "plain" or "markdown", got "${format}".`);
  }
  return value;
};

const textPart = (text: string, format: string): SendTextContent => ({ type: "text", format, text });

/**
 * Cheap, side-effect-free validation of content flags, so the CLI can refuse a
 * contradictory command before it asks for credentials or touches the network.
 */
export function validateContentFlags(flags: Flags): ContentMode[] {
  const modes = detectModes(flags);
  if (modes.length === 0) {
    throw usageError(
      "Nothing to send. Pass --text, --image, --poll, --reaction, --edit, and so on.",
      "Run `photon-msg send --help` for the full list.",
    );
  }
  if (modes.length > 1 && !flags.group) {
    throw usageError(
      `Conflicting content flags: ${modes.join(", ")}. Use one content flag, or add --group to send several parts together.`,
    );
  }
  return modes;
}

export interface BuildMessageInput {
  flags: Flags;
  upload: Uploader;
  getUsers: UserLookup;
}

/** Builds the send payload from flags. */
export async function buildMessage({ flags, upload, getUsers }: BuildMessageInput): Promise<BuiltMessage> {
  const modes = validateContentFlags(flags);

  const format = normalizeFormat(flags.format);
  // --group overrides the single-mode rule: several parts travel together.
  const mode: ContentMode = flags.group ? "group" : (modes[0] as ContentMode);
  const replyTo = flags["reply-to"];

  const initialTexts = asArray(flags.text);
  const texts =
    initialTexts.length > 0
      ? initialTexts
      : flags["text-file"] !== undefined
        ? [readTextFile(flags["text-file"])]
        : [];

  const attachmentSources = [...asArray(flags.image), ...asArray(flags.file)];

  const build = async (): Promise<{ content: SendContent; parentMessageId?: string }> => {
    switch (mode) {
      case "text": {
        if (texts.length === 0) throw usageError("--text is empty.");
        return { content: textPart(texts.join("\n"), format) };
      }

      case "attachment": {
        const source = attachmentSources[0];
        if (!source) throw usageError("--image needs a path or URL.");
        const attachmentId = await upload(source);
        const content: SendAttachmentContent = {
          type: "attachment",
          attachmentId,
          ...(flags.caption
            ? { metadata: { caption: { format, text: flags.caption } } }
            : {}),
        };
        return { content };
      }

      case "voice": {
        if (!flags.voice) throw usageError("--voice needs a path.");
        const attachmentId = await upload(flags.voice);
        const content: SendVoiceContent = { type: "voice", attachmentId };
        return { content };
      }

      case "reaction": {
        if (!replyTo) throw usageError("--reaction needs --reply-to <messageId> to name the message being reacted to.");
        const action = flags["reaction-action"] ?? "add";
        if (action !== "add" && action !== "remove") {
          throw usageError(`--reaction-action must be "add" or "remove", got "${action}".`);
        }
        const content: SendReactionContent = {
          type: "reaction",
          reaction: flags.reaction as string,
          action,
        };
        return { content, parentMessageId: replyTo };
      }

      case "poll": {
        const options = asArray(flags["poll-option"]).map((text, index) => ({
          id: `opt_${index + 1}`,
          text,
        }));
        if (options.length === 0) throw usageError("--poll needs at least one --poll-option.");
        const selectionMode = flags["poll-mode"] ?? "single";
        if (selectionMode !== "single" && selectionMode !== "multiple") {
          throw usageError(`--poll-mode must be "single" or "multiple", got "${selectionMode}".`);
        }
        const content: SendPollContent = {
          type: "poll",
          question: flags.poll as string,
          options,
          selectionMode,
        };
        return { content };
      }

      case "edit": {
        if (texts.length === 0) throw usageError("--edit needs --text with the replacement text.");
        const content: SendTextUpdateContent = {
          type: "text.update",
          format,
          text: texts.join("\n"),
        };
        return { content, parentMessageId: flags.edit as string };
      }

      case "delete": {
        const content: SendMessageDeleteContent = {
          type: "message.delete",
          ...(flags.reason ? { reason: flags.reason } : {}),
        };
        return { content, parentMessageId: flags.delete as string };
      }

      case "read": {
        if (!replyTo) throw usageError("--read needs --reply-to <messageId> to name the message being marked read.");
        const content: SendMessageReadContent = { type: "message.read" };
        return { content, parentMessageId: replyTo };
      }

      case "typing": {
        const raw = String(flags.typing).toLowerCase();
        const typing = raw === "on" || raw === "true" || raw === "1";
        if (!typing && raw !== "off" && raw !== "false" && raw !== "0") {
          throw usageError(`--typing must be "on" or "off", got "${flags.typing}".`);
        }
        const content: SendSpaceTypingUpdateContent = { type: "space.typing.update", typing };
        return { content };
      }

      case "participants": {
        const added = asArray(flags["participants-add"]);
        const removed = asArray(flags["participants-remove"]);
        const users = await getUsers([...added, ...removed]);
        const byId = new Map(users.map((user) => [user.id, user]));
        const snapshot = (id: string): UserSnapshotInput => {
          const user = byId.get(id);
          if (!user) throw usageError(`Unknown user ID "${id}".`);
          // The API accepts the user record it returned as the snapshot input.
          return user as unknown as UserSnapshotInput;
        };
        const content: SendSpaceParticipantsUpdateContent = {
          type: "space.participants.update",
          added: added.map(snapshot),
          removed: removed.map(snapshot),
        };
        return { content };
      }

      case "group": {
        const uploads = attachmentSources.length + (isSet(flags.voice) ? 1 : 0);
        if (texts.length + uploads < 2) {
          throw usageError('--group needs at least two parts, for example --text "a" --image ./b.png.');
        }
        const parts: SendContentPart[] = texts.map((text) => textPart(text, format));
        for (const source of attachmentSources) {
          const attachmentId = await upload(source);
          parts.push({ type: "attachment", attachmentId } satisfies SendAttachmentContent);
        }
        if (flags.voice) {
          const attachmentId = await upload(flags.voice);
          parts.push({ type: "voice", attachmentId } satisfies SendVoiceContent);
        }
        const content: SendGroupContent = { type: "group", parts };
        return { content };
      }

      default: {
        const exhaustive: never = mode;
        throw usageError(`Unsupported content mode "${String(exhaustive)}".`);
      }
    }
  };

  const built = await build();

  const result: BuiltMessage = { content: built.content };
  if (built.parentMessageId) result.parentMessageId = built.parentMessageId;

  const cc = asArray(flags.cc);
  const bcc = asArray(flags.bcc);
  if (flags.subject || cc.length > 0 || bcc.length > 0) {
    result.email = {
      ...(flags.subject ? { subject: flags.subject } : {}),
      ...(cc.length > 0 ? { cc: cc.map((address) => ({ address })) } : {}),
      ...(bcc.length > 0 ? { bcc: bcc.map((address) => ({ address })) } : {}),
    };
  }

  return result;
}

/** Short human description of a payload, used by --dry-run and logs. */
export function describeContent(content: SendContent | undefined): string {
  if (!content) return "nothing";
  switch (content.type) {
    case "text":
      return `text(${content.format}): ${JSON.stringify(content.text)}`;
    case "text.update":
      return `edit(${content.format}): ${JSON.stringify(content.text)}`;
    case "attachment":
      return `attachment(${content.attachmentId})`;
    case "voice":
      return `voice(${content.attachmentId})`;
    case "reaction":
      return `reaction(${content.action ?? "add"} ${content.reaction})`;
    case "poll":
      return `poll(${JSON.stringify(content.question)}, ${content.options.length} options)`;
    case "message.delete":
      return "delete";
    case "message.read":
      return "read receipt";
    case "space.typing.update":
      return `typing(${content.typing ? "on" : "off"})`;
    case "space.participants.update":
      return `participants(+${content.added.length}/-${content.removed.length})`;
    case "group":
      return `group(${content.parts.length} parts)`;
    default:
      return "unknown content";
  }
}
