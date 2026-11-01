import { describe, expect, it } from "vitest";
import {
  makeAgentBrief,
  mediaError,
  parseAgentDraft,
  recordingMime,
} from "@/lib/studio-media";

describe("media tools and reviewed drafts", () => {
  it("selects supported recording formats without pretending support", () => {
    expect(recordingMime((s) => s === "video/mp4")).toBe("video/mp4");
    expect(recordingMime(() => false)).toBe("");
  });
  it("describes permission failures rather than claiming capture", () => {
    const error = new Error();
    error.name = "NotAllowedError";
    expect(mediaError(error)).toContain("لم يبدأ التسجيل");
  });
  it("builds an explicit user goal and approval boundaries, not executed results", () => {
    const brief = makeAgentBrief("  خطط لموقعي ", "دون نشر", "مسودة");
    expect(brief).toContain("خطط لموقعي");
    expect(brief).toContain("اطلب موافقتي");
    expect(brief).toContain("لا تدّع تنفيذ أداة غير متصلة");
  });
  it("accepts bounded recent drafts and rejects malformed, future and expired data", () => {
    const now = 10_000_000;
    expect(
      parseAgentDraft(JSON.stringify({ text: "مسودة", at: now - 100 }), now),
    ).toBe("مسودة");
    for (const raw of [
      null,
      "broken",
      "null",
      "{}",
      JSON.stringify({ text: "a".repeat(6001), at: now }),
      JSON.stringify({ text: "a", at: now + 1 }),
      JSON.stringify({ text: "a", at: now - 3_600_001 }),
    ])
      expect(parseAgentDraft(raw, now)).toBeNull();
  });
});
