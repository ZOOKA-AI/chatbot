import { describe, expect, test } from "vitest";

import {
  deserializeAttribution,
  parseAttribution,
  serializeAttribution,
} from "../../lib/growth/attribution";

describe("growth attribution", () => {
  test("a campaign link records its channel", () => {
    const url = new URL(
      "https://zooka-ai.com/ar?utm_source=linkedin&utm_medium=social&utm_campaign=launch"
    );
    expect(parseAttribution(url, null)).toEqual({
      source: "linkedin",
      medium: "social",
      campaign: "launch",
      referrer: null,
    });
  });

  test("an external referrer without campaign tags is still a channel", () => {
    const url = new URL("https://zooka-ai.com/");
    expect(parseAttribution(url, "https://chatgpt.com/c/abc")).toEqual({
      source: "chatgpt.com",
      medium: "referral",
      campaign: null,
      referrer: "https://chatgpt.com/c/abc",
    });
  });

  test("internal navigation and direct visits claim no channel", () => {
    const url = new URL("https://zooka-ai.com/pricing");
    expect(parseAttribution(url, null)).toBeNull();
    expect(parseAttribution(url, "https://zooka-ai.com/blog")).toBeNull();
    expect(parseAttribution(url, "https://www.zooka-ai.com/ar")).toBeNull();
    expect(parseAttribution(url, "not a url")).toBeNull();
  });

  test("hostile values are bounded and stripped of control characters", () => {
    const url = new URL(
      `https://zooka-ai.com/?utm_source=${"a".repeat(200)}%00%0d%0aX`
    );
    const parsed = parseAttribution(url, null);
    expect(parsed?.source).toHaveLength(64);
    expect(parsed?.source).not.toMatch(/[\u0000-\u001f]/);
  });

  test("a round trip through the cookie keeps the channel", () => {
    const value = {
      source: "linkedin",
      medium: "social",
      campaign: null,
      referrer: null,
    };
    expect(deserializeAttribution(serializeAttribution(value))).toEqual(value);
  });

  test("a corrupted or empty cookie yields no attribution instead of throwing", () => {
    expect(deserializeAttribution(null)).toBeNull();
    expect(deserializeAttribution("")).toBeNull();
    expect(deserializeAttribution("{oops")).toBeNull();
    expect(deserializeAttribution(JSON.stringify({ medium: "social" }))).toBeNull();
  });
});
