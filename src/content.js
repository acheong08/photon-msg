/**
 * Turns CLI flags into a Photon `SendContent` payload.
 *
 * The API takes one polymorphic `content` object, which is how edits, unsends,
 * reactions, read receipts, typing indicators and poll votes travel: there is
 * no separate endpoint per action. This module is the single source of truth for
 * that mapping, and it stays pure by taking uploads and user lookups as
 * injected dependencies.
 */

import { readFileSync } from "node:fs";
import { usageError } from "./errors.js";

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
];

const asArray = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

const isSet = (value) => value !== undefined && value !== null && value !== false;

/**
 * Lists the content modes implied by the given flags.
 * @param {Record<string, unknown>} flags
 * @returns {string[]}
 */
export function detectModes(flags) {
  const modes = [];
  // An edit carries its replacement text, so --text belongs to the edit rather
  // than being a competing mode.
  const editing = isSet(flags.edit);
  if (!editing && (isSet(flags.text) || isSet(flags["text-file"]))) modes.push("text");
  if (asArray(flags.image).length > 0 || asArray(flags.file).length > 0) modes.push("attachment");
  if (isSet(flags.voice)) modes.push("voice");
  if (isSet(flags.reaction)) modes.push("reaction");
  if (isSet(flags.poll)) modes.push("poll");
  if (isSet(flags.edit)) modes.push("edit");
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
export function readTextFile(path) {
  if (path === "-") {
    try {
      return readFileSync(0, "utf8");
    } catch (error) {
      throw usageError(`Could not read stdin: ${error.message}`);
    }
  }
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw usageError(`Could not read ${path}: ${error.message}`);
  }
}

const normalizeFormat = (format) => {
  if (!format) return "plain";
  const value = String(format).toLowerCase();
  if (value !== "plain" && value !== "markdown") {
    throw usageError(`--format must be "plain" or "markdown", got "${format}".`);
  }
  return value;
};

const textPart = (text, format) => ({ type: "text", format, text });

/**
 * Cheap, side-effect-free validation of content flags, so the CLI can refuse a
 * contradictory command before it asks for credentials or touches the network.
 * @param {Record<string, unknown>} flags
 */
export function validateContentFlags(flags) {
  const modes = detectModes(flags);
  if (modes.length === 0) {
    throw usageError("Nothing to send. Pass --text, --image, --poll, --reaction, --edit, and so on.", "Run `photon-msg send --help` for the full list.");
  }
  if (modes.length > 1 && !flags.group) {
    throw usageError(
      `Conflicting content flags: ${modes.join(", ")}. Use one content flag, or add --group to send several parts together.`,
    );
  }
  return modes;
}

/**
 * Builds the send payload.
 *
 * @param {{
 *   flags: Record<string, any>,
 *   upload: (path: string, options?: {filename?: string}) => Promise<string>,
 *   getUsers: (ids: string[]) => Promise<Array<Record<string, any>>>,
 * }} input
 * @returns {Promise<{content: object, parentMessageId?: string, email?: object}>}
 */
export async function buildMessage({ flags, upload, getUsers }) {
  const modes = detectModes(flags);
  if (modes.length === 0) {
    throw usageError("Nothing to send. Pass --text, --image, --poll, --reaction, --edit, and so on.", "Run `photon-msg send --help` for the full list.");
  }
  if (modes.length > 1 && !flags.group) {
    throw usageError(
      `Conflicting content flags: ${modes.join(", ")}. Use one content flag, or add --group to send several parts together.`,
    );
  }

  const format = normalizeFormat(flags.format);
  // --group overrides the single-mode rule: several parts travel together.
  const mode = flags.group ? "group" : modes[0];
  const parentMessageId = flags["reply-to"];
  const result = { content: undefined, parentMessageId };

  const initialTexts = asArray(flags.text);
  const texts = initialTexts.length > 0 ? initialTexts : flags["text-file"] !== undefined ? [readTextFile(flags["text-file"])] : [];

  switch (mode) {
    case "text": {
      if (texts.length === 0) throw usageError("--text is empty.");
      const text = texts.join("\n");
      result.content = textPart(text, format);
      break;
    }

    case "attachment": {
      const files = [...asArray(flags.image), ...asArray(flags.file)];
      const attachmentId = await upload(files[0]);
      result.content = {
        type: "attachment",
        attachmentId,
        ...(flags.caption ? { metadata: { caption: { format, text: flags.caption } } } : {}),
      };
      break;
    }

    case "voice": {
      const attachmentId = await upload(flags.voice);
      result.content = { type: "voice", attachmentId };
      break;
    }

    case "reaction": {
      if (!parentMessageId) throw usageError("--reaction needs --reply-to <messageId> to name the message being reacted to.");
      const action = flags["reaction-action"] ?? "add";
      if (action !== "add" && action !== "remove") {
        throw usageError(`--reaction-action must be "add" or "remove", got "${action}".`);
      }
      result.content = { type: "reaction", reaction: flags.reaction, action };
      break;
    }

    case "poll": {
      const options = asArray(flags["poll-option"]).map((text, index) => ({ id: `opt_${index + 1}`, text }));
      if (options.length === 0) throw usageError("--poll needs at least one --poll-option.");
      const selectionMode = flags["poll-mode"] ?? "single";
      if (selectionMode !== "single" && selectionMode !== "multiple") {
        throw usageError(`--poll-mode must be "single" or "multiple", got "${selectionMode}".`);
      }
      result.content = { type: "poll", question: flags.poll, options, selectionMode };
      break;
    }

    case "edit": {
      if (texts.length === 0) throw usageError("--edit needs --text with the replacement text.");
      result.parentMessageId = flags["edit"];
      result.content = { type: "text.update", format, text: texts.join("\n") };
      break;
    }

    case "delete": {
      result.parentMessageId = flags.delete;
      result.content = { type: "message.delete", ...(flags.reason ? { reason: flags.reason } : {}) };
      break;
    }

    case "read": {
      if (!parentMessageId) throw usageError("--read needs --reply-to <messageId> to name the message being marked read.");
      result.content = { type: "message.read" };
      break;
    }

    case "typing": {
      const raw = String(flags.typing).toLowerCase();
      const typing = raw === "on" || raw === "true" || raw === "1";
      if (!typing && raw !== "off" && raw !== "false" && raw !== "0") {
        throw usageError(`--typing must be "on" or "off", got "${flags.typing}".`);
      }
      result.content = { type: "space.typing.update", typing };
      break;
    }

    case "participants": {
      const added = asArray(flags["participants-add"]);
      const removed = asArray(flags["participants-remove"]);
      const users = await getUsers([...added, ...removed]);
      const byId = new Map(users.map((user) => [user.id, user]));
      const snapshot = (id) => {
        const user = byId.get(id);
        if (!user) throw usageError(`Unknown user ID "${id}".`);
        return user;
      };
      result.content = {
        type: "space.participants.update",
        added: added.map(snapshot),
        removed: removed.map(snapshot),
      };
      break;
    }

    case "group": {
      const uploads = [...asArray(flags.image), ...asArray(flags.file)].length + (isSet(flags.voice) ? 1 : 0);
      if (texts.length + uploads < 2) {
        throw usageError("--group needs at least two parts, for example --text \"a\" --image ./b.png.");
      }
      const parts = texts.map((text) => textPart(text, format));
      for (const file of [...asArray(flags.image), ...asArray(flags.file)]) {
        parts.push({ type: "attachment", attachmentId: await upload(file) });
      }
      if (isSet(flags.voice)) parts.push({ type: "voice", attachmentId: await upload(flags.voice) });
      result.content = { type: "group", parts };
      break;
    }

    default:
      throw usageError(`Unsupported content mode "${mode}".`);
  }

  if (flags.subject || asArray(flags.cc).length > 0 || asArray(flags.bcc).length > 0) {
    result.email = {
      ...(flags.subject ? { subject: flags.subject } : {}),
      ...(asArray(flags.cc).length > 0 ? { cc: asArray(flags.cc).map((address) => ({ address })) } : {}),
      ...(asArray(flags.bcc).length > 0 ? { bcc: asArray(flags.bcc).map((address) => ({ address })) } : {}),
    };
  }

  return result;
}

/** Short human description of a payload, used by --dry-run and logs. */
export function describeContent(content) {
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
      return `reaction(${content.action} ${content.reaction})`;
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
      return content.type;
  }
}
