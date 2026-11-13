import { test } from "node:test";
import assert from "node:assert/strict";

import { buildMessage, detectModes, describeContent } from "../src/content.js";

const noUpload = async () => "pho_att_test";
const noUsers = async () => [];

test("text content defaults to plain format", async () => {
  const { content } = await buildMessage({ flags: { text: "hello" }, upload: noUpload, getUsers: noUsers });
  assert.deepEqual(content, { type: "text", format: "plain", text: "hello" });
});

test("repeated --text is joined with newlines", async () => {
  const { content } = await buildMessage({ flags: { text: ["a", "b"] }, upload: noUpload, getUsers: noUsers });
  assert.equal(content.text, "a\nb");
});

test("markdown format is passed through", async () => {
  const { content } = await buildMessage({
    flags: { text: "**hi**", format: "markdown" },
    upload: noUpload,
    getUsers: noUsers,
  });
  assert.equal(content.format, "markdown");
});

test("an invalid format is rejected", async () => {
  await assert.rejects(
    buildMessage({ flags: { text: "x", format: "html" }, upload: noUpload, getUsers: noUsers }),
    /--format must be/,
  );
});

test("no content flags is a usage error", async () => {
  await assert.rejects(buildMessage({ flags: {}, upload: noUpload, getUsers: noUsers }), /Nothing to send/);
});

test("conflicting content flags require --group", async () => {
  await assert.rejects(
    buildMessage({ flags: { text: "a", image: "b.png" }, upload: noUpload, getUsers: noUsers }),
    /Conflicting content flags/,
  );
});

test("attachment uploads and carries a caption", async () => {
  const calls = [];
  const upload = async (path) => {
    calls.push(path);
    return "pho_att_1";
  };
  const { content } = await buildMessage({
    flags: { image: ["photo.png"], caption: "nice" },
    upload,
    getUsers: noUsers,
  });
  assert.deepEqual(calls, ["photo.png"]);
  assert.equal(content.type, "attachment");
  assert.equal(content.attachmentId, "pho_att_1");
  assert.equal(content.metadata.caption.text, "nice");
});

test("voice note uses the voice content type", async () => {
  const { content } = await buildMessage({
    flags: { voice: "memo.m4a" },
    upload: noUpload,
    getUsers: noUsers,
  });
  assert.deepEqual(content, { type: "voice", attachmentId: "pho_att_test" });
});

test("poll builds stable option ids", async () => {
  const { content } = await buildMessage({
    flags: { poll: "Lunch?", "poll-option": ["Yes", "No"] },
    upload: noUpload,
    getUsers: noUsers,
  });
  assert.deepEqual(content, {
    type: "poll",
    question: "Lunch?",
    options: [
      { id: "opt_1", text: "Yes" },
      { id: "opt_2", text: "No" },
    ],
    selectionMode: "single",
  });
});

test("poll without options is rejected", async () => {
  await assert.rejects(
    buildMessage({ flags: { poll: "Lunch?" }, upload: noUpload, getUsers: noUsers }),
    /at least one --poll-option/,
  );
});

test("reaction requires a target message", async () => {
  await assert.rejects(
    buildMessage({ flags: { reaction: "❤️" }, upload: noUpload, getUsers: noUsers }),
    /needs --reply-to/,
  );
});

test("reaction carries the action", async () => {
  const { content } = await buildMessage({
    flags: { reaction: "❤️", "reply-to": "pho_msg_1", "reaction-action": "remove" },
    upload: noUpload,
    getUsers: noUsers,
  });
  assert.deepEqual(content, { type: "reaction", reaction: "❤️", action: "remove" });
});

test("edit targets the edited message via parentMessageId", async () => {
  const { content, parentMessageId } = await buildMessage({
    flags: { edit: "pho_msg_9", text: "fixed" },
    upload: noUpload,
    getUsers: noUsers,
  });
  assert.equal(parentMessageId, "pho_msg_9");
  assert.deepEqual(content, { type: "text.update", format: "plain", text: "fixed" });
});

test("delete uses the message id as the parent", async () => {
  const { content, parentMessageId } = await buildMessage({
    flags: { delete: "pho_msg_7", reason: "oops" },
    upload: noUpload,
    getUsers: noUsers,
  });
  assert.equal(parentMessageId, "pho_msg_7");
  assert.deepEqual(content, { type: "message.delete", reason: "oops" });
});

test("typing parses on/off", async () => {
  const on = await buildMessage({ flags: { typing: "on" }, upload: noUpload, getUsers: noUsers });
  const off = await buildMessage({ flags: { typing: "off" }, upload: noUpload, getUsers: noUsers });
  assert.equal(on.content.typing, true);
  assert.equal(off.content.typing, false);
});

test("read receipt requires a target", async () => {
  await assert.rejects(
    buildMessage({ flags: { read: true }, upload: noUpload, getUsers: noUsers }),
    /needs --reply-to/,
  );
});

test("participants are resolved into snapshots", async () => {
  const getUsers = async (ids) => ids.map((id) => ({ id, platform: "imessage", kind: "human", handle: `+1${id}` }));
  const { content } = await buildMessage({
    flags: { "participants-add": ["u1"], "participants-remove": ["u2"] },
    upload: noUpload,
    getUsers,
  });
  assert.equal(content.type, "space.participants.update");
  assert.equal(content.added[0].id, "u1");
  assert.equal(content.removed[0].id, "u2");
});

test("an unknown participant id is rejected", async () => {
  await assert.rejects(
    buildMessage({
      flags: { "participants-add": ["ghost"] },
      upload: noUpload,
      getUsers: async () => [],
    }),
    /Unknown user ID/,
  );
});

test("group combines text and attachments in order", async () => {
  const upload = async (path) => `att:${path}`;
  const { content } = await buildMessage({
    flags: { group: true, text: ["caption"], image: ["a.png"] },
    upload,
    getUsers: noUsers,
  });
  assert.equal(content.type, "group");
  assert.equal(content.parts.length, 2);
  assert.equal(content.parts[0].text, "caption");
  assert.equal(content.parts[1].attachmentId, "att:a.png");
});

test("group with a single part is rejected", async () => {
  await assert.rejects(
    buildMessage({ flags: { group: true, text: ["only"] }, upload: noUpload, getUsers: noUsers }),
    /at least two parts/,
  );
});

test("email options are collected separately from content", async () => {
  const { email } = await buildMessage({
    flags: { text: "hi", subject: "S", cc: ["a@example.com"], bcc: ["b@example.com"] },
    upload: noUpload,
    getUsers: noUsers,
  });
  assert.equal(email.subject, "S");
  assert.deepEqual(email.cc, [{ address: "a@example.com" }]);
  assert.deepEqual(email.bcc, [{ address: "b@example.com" }]);
});

test("detectModes reports every requested mode", () => {
  assert.deepEqual(detectModes({ text: "a" }), ["text"]);
  assert.deepEqual(detectModes({ image: "x", voice: "y" }), ["attachment", "voice"]);
  assert.deepEqual(detectModes({}), []);
});

test("describeContent renders readable summaries", () => {
  assert.match(describeContent({ type: "text", format: "plain", text: "hi" }), /text\(plain\)/);
  assert.equal(describeContent({ type: "message.read" }), "read receipt");
  assert.match(describeContent({ type: "group", parts: [1, 2] }), /2 parts/);
});
