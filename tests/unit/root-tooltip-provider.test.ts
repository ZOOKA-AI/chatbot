import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Cairo: () => ({ variable: "font-cairo" }),
  Geist: () => ({ variable: "font-geist" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));

const navigation = vi.hoisted(() => ({ suspended: false }));

vi.mock("next/navigation", () => ({
  usePathname: () => {
    if (navigation.suspended) {
      throw new Promise(() => {
        // A fallback pathname is intentionally unresolved during prerendering.
      });
    }
    return "/ar";
  },
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

  test("keeps the page and footer renderable while the pathname suspends", () => {
    navigation.suspended = true;
    try {
      const html = renderToStaticMarkup(
        RootLayout({ children: createElement("main", null, "Blog page") })
      );

      expect(html).toContain("Blog page");
      expect(html).toContain("<footer");
      expect(html).not.toContain('aria-label="Open tunnel console"');
    } finally {
      navigation.suspended = false;
    }
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
