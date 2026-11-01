import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import {
  APP_STORE_NAME,
  COMPANY_LEGAL_NAME_EN,
  CONTACT_EMAIL,
  PRODUCT_NAME,
  PRODUCT_NAME_AR,
  SITE_URL,
} from "../lib/brand";
async function main() {
  // Local production output only. Never accept a remote target from user/environment.
  const origin = "http://127.0.0.1:3899";
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", "3899"],
    { stdio: "ignore" },
  );
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(`${origin}/ping`);
        up = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!up) throw new Error("Local production server unavailable");
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      const message = String(error);
      // Vercel's build image has no Playwright browser. Only the bundle gate can
      // run there; force this one with BRAND_RENDER_GATE=strict.
      if (
        message.includes("Executable doesn't exist") &&
        process.env.BRAND_RENDER_GATE !== "strict"
      ) {
        console.warn(
          "Rendered brand gate SKIPPED: no Playwright Chromium in this build image. Run `pnpm exec playwright install chromium` or set BRAND_RENDER_GATE=strict to enforce it.",
        );
        return;
      }
      throw error;
    }
    for (const lang of ["ar", "en"]) {
      const context = await browser.newContext();
      await context.addCookies([
        { name: "zooka_lang", value: lang, url: origin },
      ]);
      const page = await context.newPage();
      for (const route of [
        "/",
        "/about",
        "/pricing",
        "/privacy",
        "/terms",
        "/contact",
        "/login",
        "/register",
      ]) {
        const response = await page.goto(origin + route);
        if (!response?.ok())
          throw new Error(`${route}: HTTP ${response?.status()}`);
        const html = await page.content();
        if (
          /@gmail\.com|vercel\.app|Sterilization|(?<!FZ-)\bLLC\b|zoka-ai\.com/i.test(
            html,
          )
        )
          throw new Error(`${route}: forbidden string in rendered HTML`);
        const title = await page.title();
        const count =
          title.split(PRODUCT_NAME).length -
          1 +
          title.split(PRODUCT_NAME_AR).length -
          1;
        if (count !== 1)
          throw new Error(`${route}: title brand count ${count}`);
        const footer = await page.locator("footer").allTextContents();
        if (
          !footer.some(
            (s) =>
              s.includes(COMPANY_LEGAL_NAME_EN) && s.includes(CONTACT_EMAIL),
          )
        )
          throw new Error(`${route}: missing legal footer`);
        for (const el of await page
          .locator('link[rel="canonical"],meta[property="og:url"]')
          .all()) {
          const value =
            (await el.getAttribute("href")) ??
            (await el.getAttribute("content"));
          if (!value?.startsWith(SITE_URL + "/") && value !== SITE_URL)
            throw new Error(`${route}: noncanonical URL`);
        }
      }
      await context.close();
    }
    const manifest = await (
      await fetch(origin + "/manifest.webmanifest")
    ).json();
    if (manifest.name !== APP_STORE_NAME)
      throw new Error("Manifest name mismatch");
    console.log("Rendered brand gate A–D passed in Arabic and English.");
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
