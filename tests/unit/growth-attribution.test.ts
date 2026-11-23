import { describe, expect, test } from "vitest";

import {
  deserializeAttribution,
  isInternalHost,
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

/**
 * The five acquisition paths the release must survive. Named one by one because
 * "it works for utm links" says nothing about the AI-assistant referral that is
 * currently our second real channel.
 */
describe("acquisition paths", () => {
  test("Direct: no referrer and no tags claims nothing", () => {
    expect(parseAttribution(new URL("https://zooka-ai.com/ar"), null)).toBeNull();
  });

  test("Google: an accounts.google.com referrer is a channel", () => {
    const parsed = parseAttribution(
      new URL("https://zooka-ai.com/register"),
      "https://accounts.google.com/o/oauth2/auth"
    );
    assertChannel(parsed, "accounts.google.com", "referral");
  });

  test("AI referral: chatgpt.com is a channel", () => {
    const parsed = parseAttribution(
      new URL("https://zooka-ai.com/"),
      "https://chatgpt.com/c/6a59a371"
    );
    assertChannel(parsed, "chatgpt.com", "referral");
  });

  test("Social: linkedin.com is a channel", () => {
    const parsed = parseAttribution(
      new URL("https://zooka-ai.com/ar"),
      "https://www.linkedin.com/feed/"
    );
    assertChannel(parsed, "www.linkedin.com", "referral");
  });

  test("UTM campaign: tags win over the referrer and keep the campaign", () => {
    const parsed = parseAttribution(
      new URL(
        "https://zooka-ai.com/ar?utm_source=youtube&utm_medium=video&utm_campaign=launch-2026"
      ),
      "https://www.youtube.com/watch?v=abc"
    );
    assertChannel(parsed, "youtube", "video");
    expect(parsed?.campaign).toBe("launch-2026");
  });

  test("First touch: an existing channel is never replaced by a later direct visit", () => {
    const first = parseAttribution(
      new URL("https://zooka-ai.com/"),
      "https://chatgpt.com/c/1"
    );
    const cookie = serializeAttribution(first as never);
    const laterDirect = parseAttribution(new URL("https://zooka-ai.com/"), null);
    expect(laterDirect).toBeNull();
    expect(deserializeAttribution(cookie)?.source).toBe("chatgpt.com");
  });
  test("a look-alike domain is a referral, not internal navigation", () => {
    const url = new URL("https://zooka-ai.com/");
    expect(parseAttribution(url, "https://evilzooka-ai.com/x")).toEqual({
      source: "evilzooka-ai.com",
      medium: "referral",
      campaign: null,
      referrer: "https://evilzooka-ai.com/x",
    });
  });
});

function assertChannel(
  parsed: ReturnType<typeof parseAttribution>,
  source: string,
  medium: string
) {
  expect(parsed, "this path must be attributed, not dropped").not.toBeNull();
  expect(parsed?.source).toBe(source);
  expect(parsed?.medium).toBe(medium);
}

/**
 * A lookalike domain must never be treated as ours. This is not cosmetic: an
 * internal host is dropped from attribution, so "evilzooka-ai.com" slipping
 * through would silently erase real traffic from every channel report.
 */
describe("internal host detection", () => {
  test("our own host and its real subdomains are internal", () => {
    expect(isInternalHost("zooka-ai.com")).toBe(true);
    expect(isInternalHost("www.zooka-ai.com")).toBe(true);
    expect(isInternalHost("WWW.ZOOKA-AI.COM")).toBe(true);
    expect(isInternalHost("localhost")).toBe(true);
  });

  test("a lookalike domain is not internal", () => {
    expect(isInternalHost("evilzooka-ai.com")).toBe(false);
    expect(isInternalHost("zooka-ai.com.evil.tld")).toBe(false);
    expect(isInternalHost("notzooka-ai.com")).toBe(false);
  });

  test("a referrer from a lookalike domain is recorded as a channel", () => {
    const parsed = parseAttribution(
      new URL("https://zooka-ai.com/"),
      "https://evilzooka-ai.com/landing"
    );
    expect(parsed?.source).toBe("evilzooka-ai.com");
  });
});
