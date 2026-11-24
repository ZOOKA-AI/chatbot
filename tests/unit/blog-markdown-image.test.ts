import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderMarkdown } from "@/lib/blog/markdown";

describe("blog markdown images", () => {
  it("renders a standalone https image line", () => {
    const html = renderToStaticMarkup(
      renderMarkdown("![غلاف](https://zooka-ai.com/images/posters/poster-1.jpg)\n\nنص المقال.")
    );
    expect(html).toContain("<img");
    expect(html).toContain('src="https://zooka-ai.com/images/posters/poster-1.jpg"');
    expect(html).toContain('alt="غلاف"');
    expect(html).toContain('loading="lazy"');
  });

  it("refuses non-https image sources", () => {
    const html = renderToStaticMarkup(renderMarkdown("![x](http://evil.example/a.png)"));
    expect(html).not.toContain("<img");
  });

  it("leaves ordinary links alone", () => {
    const html = renderToStaticMarkup(renderMarkdown("[zooka](https://zooka-ai.com)"));
    expect(html).toContain("<a");
    expect(html).not.toContain("<img");
  });
});
