import { describe, expect, it } from "vitest";

import { htmlToText, sanitizeHtml } from "@/lib/mail/sanitize";

describe("HTML sanitiser", () => {
  it("keeps ordinary formatting", () => {
    const html = "<p>Hello <strong>world</strong></p><ul><li>one</li></ul>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("drops script, style and their contents rather than their tags alone", () => {
    const html = `<p>safe</p><script>alert("x")</script><style>p{color:red}</style><p>after</p>`;
    const clean = sanitizeHtml(html);
    expect(clean).toBe("<p>safe</p><p>after</p>");
    expect(clean).not.toContain("alert");
    expect(clean).not.toContain("color:red");
  });

  it("defeats tag splitting and unclosed tags", () => {
    expect(sanitizeHtml("<scr<script>ipt>alert(1)</script>")).not.toContain("script");
    expect(sanitizeHtml("<p>never closed")).toBe("<p>never closed</p>");
    expect(sanitizeHtml("<<script>>alert(1)<</script>>")).not.toContain("<script");
  });

  it("drops every event handler attribute", () => {
    const clean = sanitizeHtml('<p onclick="steal()" onmouseover="x">text</p>');
    expect(clean).toBe("<p>text</p>");
    expect(clean).not.toContain("onclick");
  });

  it("refuses javascript, data and control-character obfuscated URLs", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "/relative/path",
    ]) {
      const clean = sanitizeHtml(`<a href="${href}">x</a>`);
      expect(clean).not.toContain("href");
    }
  });

  it("hardens a legitimate link", () => {
    const clean = sanitizeHtml('<a href="https://example.com/a?b=1&amp;c=2" title="t">x</a>');
    expect(clean).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
  });

  it("keeps remote images out by default and allows them only when asked", () => {
    const html = '<img src="https://tracker.example.com/p.gif" alt="pixel">';
    expect(sanitizeHtml(html)).toBe("");
    const allowed = sanitizeHtml(html, { allowImages: true });
    expect(allowed).toContain('src="https://tracker.example.com/p.gif"');
    expect(allowed).toContain('alt="pixel"');
  });

  it("drops foreign-content namespaces that can carry script", () => {
    const clean = sanitizeHtml("<svg><script>alert(1)</script></svg><p>ok</p>");
    expect(clean).toBe("<p>ok</p>");
  });

  it("strips forms, inputs and embedded documents entirely", () => {
    const clean = sanitizeHtml(
      '<form action="https://evil"><input name="password"><button>go</button></form><iframe src="https://evil"></iframe><p>ok</p>'
    );
    expect(clean).toBe("<p>ok</p>");
  });

  it("escapes text so a stray angle bracket cannot become markup", () => {
    expect(sanitizeHtml("2 < 3 and 5 > 4")).toBe("2 &lt; 3 and 5 &gt; 4");
    expect(sanitizeHtml("&amp; stays")).toBe("&amp; stays");
  });

  it("keeps tables and numeric span attributes but refuses a script in a span value", () => {
    const clean = sanitizeHtml(
      '<table><tr><td colspan="2">a</td></tr></table><td colspan="2px">b</td>'
    );
    expect(clean).toContain('<td colspan="2">');
    expect(clean).not.toContain("2px");
  });

  it("removes comments", () => {
    expect(sanitizeHtml("<!-- <script>alert(1)</script> --><p>ok</p>")).toBe("<p>ok</p>");
  });

  it("produces plain text for the model without markup", () => {
    const text = htmlToText("<p>Hello <b>there</b></p><script>x()</script>");
    expect(text).toBe("Hello there");
    expect(text).not.toContain("<");
  });
  it("decodes entities once, so escaped markup stays text", () => {
    expect(htmlToText("<p>&amp;lt;b&amp;gt; and &amp;#60;</p>")).toBe("&lt;b&gt; and &#60;");
    expect(htmlToText("a<script>x()</script >b")).toBe("a b");
  });
});
