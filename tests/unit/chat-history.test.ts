import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAT_HISTORY_PAGE_SIZE,
  normalizeChatHistoryLimit,
} from "@/lib/chat-history";

test("chat history pages default to 90 and cap requests at 90", () => {
  assert.equal(CHAT_HISTORY_PAGE_SIZE, 90);
  assert.equal(normalizeChatHistoryLimit(null), 90);
  assert.equal(normalizeChatHistoryLimit(""), 90);
  assert.equal(normalizeChatHistoryLimit("120"), 90);
  assert.equal(normalizeChatHistoryLimit("15"), 15);
  assert.equal(normalizeChatHistoryLimit("0"), 1);
  assert.equal(normalizeChatHistoryLimit("20items"), 90);
  assert.equal(normalizeChatHistoryLimit("-20"), 90);
});
