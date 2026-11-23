import { describe, expect, it } from "vitest";

import { renderShell } from "@/lib/email/send";

describe("mail shell", () => {
  const html = renderShell("عنوان", "<p>نص</p>", "ar", "https://zooka-ai.com");

  it("uses the 2x email logo on the canonical host, with a visible plate", () => {
    expect(html).toContain('src="https://zooka-ai.com/images/zooka-email-logo.png"');
    expect(html).toContain("display:block");
    expect(html).toContain("background:#16213a");
    // the old asset read as an empty dark tile inside the dark card
    expect(html).not.toContain("zooka-logo-120.png");
  });

  it("keeps the wordmark as a text fallback when images are blocked", () => {
    expect(html).toContain(">ZOOKA-AI</div>");
    expect(html).toContain('alt="ZOOKA-AI"');
  });

  it("stays rtl for arabic and ltr for english", () => {
    expect(renderShell("t", "b", "ar")).toContain('dir="rtl"');
    expect(renderShell("t", "b", "en")).toContain('dir="ltr"');
  });
});
