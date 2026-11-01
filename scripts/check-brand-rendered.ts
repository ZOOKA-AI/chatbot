import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import {
  APP_STORE_NAME,
  COMPANY_ADDRESS,
  COMPANY_COUNTRY,
  COMPANY_LEGAL_NAME_AR,
  COMPANY_LEGAL_NAME_EN,
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
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
        const visible = await page.locator("body").innerText();
        if (/\*{3}\s*·\s*\*{3}/.test(visible))
          throw new Error(`${route}: masked identity is forbidden`);
        const footerText = (
          await page.locator("footer").allTextContents()
        ).join(" ");
        for (const field of [
          COMPANY_LEGAL_NAME_AR,
          COMPANY_LEGAL_NAME_EN,
          COMPANY_ADDRESS,
          COMPANY_COUNTRY,
          CONTACT_EMAIL,
        ]) {
          if (!footerText.includes(field))
            throw new Error(`${route}: footer identity field missing`);
        }
        const normalizePhone = (value: string) => value.replace(/[\s()-]/g, "");
        const canonical = normalizePhone(CONTACT_PHONE_E164);
        const local = normalizePhone(CONTACT_PHONE_DISPLAY);
        for (const link of await page
          .locator('a[href^="tel:"],a[href^="https://wa.me/"]')
          .all()) {
          const href = (await link.getAttribute("href")) ?? "";
          const number = normalizePhone(
            href.replace(/^tel:|^https:\/\/wa\.me\//, "").split("?")[0],
          ).replace(/^\+/, "");
          if (number !== canonical.replace(/^\+/, ""))
            throw new Error(`${route}: noncanonical phone destination`);
        }
        for (const candidate of visible.match(
          /(?:\+971|0)\d(?:[\s-]?\d){8,11}/g,
        ) ?? []) {
          if (![canonical, local].includes(normalizePhone(candidate)))
            throw new Error(`${route}: noncanonical visible phone`);
        }
        if (
          ["/privacy", "/terms", "/refund"].includes(route) &&
          (!visible.includes(COMPANY_LEGAL_NAME_AR) ||
            !visible.replace(/\s/g, " ").includes(CONTACT_PHONE_DISPLAY))
        )
          throw new Error(`${route}: legal name or canonical phone absent`);
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
