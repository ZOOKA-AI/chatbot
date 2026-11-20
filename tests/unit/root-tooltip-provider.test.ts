import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Cairo: () => ({ variable: "font-cairo" }),
  Geist: () => ({ variable: "font-geist" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ar",
  useRouter: () => ({ push: vi.fn() }),
}));

import RootLayout from "@/app/layout";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";

describe("root tooltip context during prerendering", () => {
  test("renders the global tunnel console without a sidebar provider", () => {
    const html = renderToStaticMarkup(
      RootLayout({ children: createElement("main", null, "Public page") })
    );

    expect(html).toContain('aria-label="Open tunnel console"');
    expect(html).toContain("Public page");
  });

  test("provides tooltip context to page content as well as global controls", () => {
    const html = renderToStaticMarkup(
      RootLayout({
        children: createElement(
          Tooltip,
          null,
          createElement(TooltipTrigger, null, "Page tooltip")
        ),
      })
    );

    expect(html).toContain("Page tooltip");
    expect(html).toContain('aria-label="Open tunnel console"');
  });
});
