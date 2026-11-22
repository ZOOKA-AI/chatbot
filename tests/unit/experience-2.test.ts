import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { liveAccounts } from "@/components/social-icon-row";
import { SOCIAL_ACCOUNTS } from "@/lib/social-accounts";
import {
  bugReportMailto,
  HELP_TOPICS,
  SUPPORT_EMAIL,
  SUPPORT_FAQ,
} from "@/lib/support/content";
import {
  featuredVideo,
  formatDuration,
  isoDuration,
  TV_VIDEOS,
  visibleVideos,
} from "@/lib/tv/videos";

const ROOT = process.cwd();

/** Every URL path the app router serves, with route groups removed. */
function appRoutes(): Set<string> {
  const routes = new Set<string>();
  const walk = (dir: string, segments: string[]) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "api" || name.startsWith("_")) {
          continue;
        }
        const next = /^\(.*\)$/.test(name) ? segments : [...segments, name];
        walk(full, next);
      } else if (name === "page.tsx") {
        routes.add(`/${segments.join("/")}`);
      }
    }
  };
  walk(join(ROOT, "app"), []);
  return routes;
}

describe("ZOOKA AI TV catalog", () => {
  test("every video the site can show is a file we own and it exists", () => {
    for (const video of TV_VIDEOS.filter((v) => v.visibility !== "hidden")) {
      expect(video.verification).toBe("owned-file");
      for (const path of [
        video.sourceUrl,
        video.thumbnail,
        video.vertical,
        video.englishVersion,
        video.englishVertical,
        video.captions?.ar,
        video.captions?.en,
      ]) {
        if (path) {
          expect(existsSync(join(ROOT, "public", path)), path).toBe(true);
        }
      }
    }
  });

  test("videos waiting for review never reach production", () => {
    const draft = {
      ...TV_VIDEOS[0],
      id: "draft-check",
      visibility: "review" as const,
    };
    const catalog = [...TV_VIDEOS, draft];
    const prod = visibleVideos(catalog, true);
    expect(prod.every((video) => video.visibility === "published")).toBe(true);
    expect(prod.some((video) => video.id === "draft-check")).toBe(false);
    const preview = visibleVideos(catalog, false);
    expect(preview.some((video) => video.id === "draft-check")).toBe(true);
  });

  test("owner-approved brand videos are published", () => {
    for (const id of ["meet-zooka-ai", "build-with-zooka-ai"]) {
      expect(TV_VIDEOS.find((video) => video.id === id)?.visibility).toBe(
        "published"
      );
    }
  });

  test("required fields are filled in both languages", () => {
    const ids = new Set<string>();
    for (const video of TV_VIDEOS) {
      expect(ids.has(video.id)).toBe(false);
      ids.add(video.id);
      expect(video.title.ar.length).toBeGreaterThan(0);
      expect(video.title.en.length).toBeGreaterThan(0);
      expect(video.description.ar.length).toBeGreaterThan(0);
      expect(video.description.en.length).toBeGreaterThan(0);
      expect(video.duration).toBeGreaterThan(0);
      expect(video.publishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("brand video durations match the brief", () => {
    const meet = TV_VIDEOS.find((v) => v.id === "meet-zooka-ai");
    const build = TV_VIDEOS.find((v) => v.id === "build-with-zooka-ai");
    expect(meet?.duration).toBeGreaterThanOrEqual(30);
    expect(meet?.duration).toBeLessThanOrEqual(45);
    expect(build?.duration).toBeGreaterThanOrEqual(45);
    expect(build?.duration).toBeLessThanOrEqual(60);
  });

  test("helpers", () => {
    expect(formatDuration(38)).toBe("0:38");
    expect(formatDuration(72)).toBe("1:12");
    expect(isoDuration(52)).toBe("PT52S");
    expect(isoDuration(65)).toBe("PT1M5S");
    expect(featuredVideo(visibleVideos(TV_VIDEOS, false))?.id).toBe(
      "meet-zooka-ai"
    );
    expect(featuredVideo([])).toBeUndefined();
  });
});

describe("official accounts", () => {
  test("only live accounts with an https link are shown as icons", () => {
    const live = liveAccounts();
    expect(live.length).toBeGreaterThan(0);
    for (const account of live) {
      expect(account.status).toBe("live");
      expect(account.href?.startsWith("https://")).toBe(true);
    }
  });

  test("pending accounts carry no link", () => {
    for (const account of SOCIAL_ACCOUNTS.filter(
      (a) => a.status === "pending"
    )) {
      expect(account.href).toBeUndefined();
      expect(liveAccounts([account.id])).toHaveLength(0);
    }
  });

  test("requested order is kept and unknown ids are dropped", () => {
    expect(liveAccounts(["youtube", "nope", "x"]).map((a) => a.id)).toEqual([
      "youtube",
      "x",
    ]);
  });
});

describe("support center content", () => {
  const routes = appRoutes();

  test("has the ten questions from the brief", () => {
    expect(SUPPORT_FAQ).toHaveLength(10);
  });

  test("every internal link points at a real page", () => {
    const hrefs = [
      ...HELP_TOPICS.flatMap((topic) => topic.links.map((link) => link.href)),
      ...SUPPORT_FAQ.flatMap((item) => (item.href ? [item.href] : [])),
    ].filter((href) => href.startsWith("/"));
    for (const href of hrefs) {
      expect(routes.has(href.split("#")[0]), href).toBe(true);
    }
  });

  test("never promises live 24/7 support", () => {
    const text = JSON.stringify([HELP_TOPICS, SUPPORT_FAQ]);
    expect(text).not.toMatch(/24\/7(?! channel)|على مدار الساعة(?!\.)/);
    expect(text).toContain("not a live 24/7 channel");
  });

  test("bug report opens a prefilled email to support", () => {
    const href = bugReportMailto("en");
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(href)).toContain("Device and browser");
  });

  test("new public pages exist", () => {
    for (const route of ["/tv", "/support", "/settings", "/social"]) {
      expect(routes.has(route), route).toBe(true);
    }
  });
});
