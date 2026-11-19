import { describe, expect, it } from "vitest";
import { languageEntry } from "@/lib/i18n-entry";

describe("language entry points", () => {
  it("sets the language cookie and redirects to home for /en", () => {
    const res = languageEntry("en", new Request("https://zooka-ai.com/en"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://zooka-ai.com/");
    expect(res.cookies.get("zooka_lang")?.value).toBe("en");
  });

  it("keeps the requested path for /en/pricing", () => {
    const res = languageEntry("en", new Request("https://zooka-ai.com/en/pricing"), ["pricing"]);
    expect(res.headers.get("location")).toBe("https://zooka-ai.com/pricing");
  });

  it("supports Arabic and honours a safe next parameter", () => {
    const res = languageEntry("ar", new Request("https://zooka-ai.com/en?next=/workspace/agent"));
    expect(res.cookies.get("zooka_lang")?.value).toBe("ar");
    expect(res.headers.get("location")).toBe("https://zooka-ai.com/workspace/agent");
  });

  it("refuses an off-site next parameter", () => {
    const res = languageEntry("en", new Request("https://zooka-ai.com/en?next=//evil.example/x"));
    expect(res.headers.get("location")).toBe("https://zooka-ai.com/");
  });
});
