import { describe, expect, it } from "vitest";
import { safePreviewSrc } from "@/lib/http/web-preview-url";

describe("web preview URL", () => {
  it("canonicalizes absolute web URLs", () => {
    expect(safePreviewSrc(" HTTPS://EXAMPLE.COM/preview ")).toBe("https://example.com/preview");
    expect(safePreviewSrc("http://example.com")).toBe("http://example.com/");
  });

  it.each([undefined, "", "/login", "//example.com", "about:blank", "data:text/plain,test", "https://user@example.com"])(
    "refuses unsupported input %s",
    (value) => expect(safePreviewSrc(value)).toBeUndefined()
  );
});
