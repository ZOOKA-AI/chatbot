import { describe, expect, it } from "vitest";

import { htmlToText } from "@/lib/ai/tools/read-url";

describe("read-url script filter", () => {
  it("drops a script whose end tag carries whitespace and attributes", () => {
    const text = htmlToText("<p>keep</p><script>secret()</script\t\n bar><p>also</p>");
    expect(JSON.stringify(text)).not.toContain("secret");
  });
});
