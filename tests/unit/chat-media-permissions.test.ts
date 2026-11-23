import { describe, expect, it } from "vitest";
import config from "../../next.config";

describe("live chat media permissions", () => {
  it("enables the camera only on chat pages, without allowing cross-origin capture", async () => {
    const headers = (await config.headers?.()) ?? [];
    const rules = headers.flatMap(({ source, headers: values }) =>
      values
        .filter(({ key }) => key === "Permissions-Policy")
        .map(({ value }) => ({ source, value }))
    );
    expect(rules.map(({ source }) => source)).toEqual(["/:path*", "/", "/chat/:id"]);
    expect(rules[0].value).toContain("camera=()");
    for (const rule of rules.slice(1)) {
      expect(rule.value).toBe(
        "camera=(self), microphone=(self), display-capture=(self), geolocation=()"
      );
    }
  });
});
