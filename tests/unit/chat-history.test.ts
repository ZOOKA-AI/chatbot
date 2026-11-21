import { describe, expect, it } from "vitest";

import { CHAT_HISTORY_PAGE_SIZE, historyLimitSchema } from "@/lib/chat-history";

describe("chat history limit", () => {
  it("lets the sidebar request a full page of 90", () => {
    expect(CHAT_HISTORY_PAGE_SIZE).toBe(90);
    expect(historyLimitSchema.parse("90")).toBe(90);
    expect(historyLimitSchema.parse("15")).toBe(15);
  });

  it("refuses values outside 1..90 or that are not whole numbers", () => {
    for (const bad of ["0", "91", "120", "-20", "20items", "abc", "1.5"]) {
      expect(historyLimitSchema.safeParse(bad).success).toBe(false);
    }
  });
});
