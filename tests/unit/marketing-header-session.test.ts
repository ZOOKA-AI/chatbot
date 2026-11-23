import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  status: "loading",
  data: null as null | { user: { type: string } },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => auth,
}));

import { SiteHeader } from "@/components/marketing/site-header";

describe("marketing header session", () => {
  it("reserves the account area without showing sign-in links while loading", () => {
    auth.status = "loading";
    auth.data = null;
    const html = renderToStaticMarkup(createElement(SiteHeader, { lang: "ar" }));

    expect(html).toContain('aria-hidden="true" class="invisible');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('href="/register"');
    expect(html).not.toContain('href="/workspace"');
  });

  it.each([
    ["unauthenticated", null],
    ["authenticated", { user: { type: "guest" } }],
  ])("shows sign-in and registration for %s visitors", (status, data) => {
    auth.status = status;
    auth.data = data;
    const html = renderToStaticMarkup(createElement(SiteHeader, { lang: "en" }));

    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/register"');
    expect(html).not.toContain('href="/workspace"');
  });

  it.each(["ar", "en"] as const)(
    "shows the workspace entry for a signed-in user in %s",
    (lang) => {
      auth.status = "authenticated";
      auth.data = { user: { type: "regular" } };
      const html = renderToStaticMarkup(createElement(SiteHeader, { lang }));

      expect(html).toContain('href="/workspace"');
      expect(html).toContain(lang === "ar" ? "مساحة عملك" : "Your workspace");
      expect(html).not.toContain('href="/login"');
      expect(html).not.toContain('href="/register"');
    }
  );
});
