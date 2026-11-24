import { describe, expect, it } from "vitest";
import { firstImageUrl } from "@/lib/blog/markdown";

describe("firstImageUrl", () => {
  it("returns the first standalone https image line", () => {
    const body = "![غلاف](https://zooka-ai.com/images/landing-agent.webp)\n\n## عنوان\n\nنص";
    expect(firstImageUrl(body)).toBe("https://zooka-ai.com/images/landing-agent.webp");
  });

  it("ignores http images so a page never advertises an insecure cover", () => {
    expect(firstImageUrl("![غلاف](http://example.com/a.png)\n\nنص")).toBeNull();
  });

  it("ignores inline occurrences that the renderer would not treat as an image", () => {
    expect(firstImageUrl("نص قبل ![غلاف](https://zooka-ai.com/a.png) نص بعد")).toBeNull();
  });

  it("returns null when the body has no image", () => {
    expect(firstImageUrl("## عنوان\n\nنص بلا صورة")).toBeNull();
  });

  it("picks the second image when the first line is not an image", () => {
    const body = "## عنوان\n![أول](https://zooka-ai.com/one.webp)\n![ثاني](https://zooka-ai.com/two.webp)";
    expect(firstImageUrl(body)).toBe("https://zooka-ai.com/one.webp");
  });
});
