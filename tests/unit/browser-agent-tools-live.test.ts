import { afterAll, describe, expect, it } from "vitest";

import { createBrowserTools } from "@/lib/ai/tools/browser";
import { listEvidence } from "@/lib/browser/sessions";

/**
 * The agent's browser tools driving a real Chromium over DevTools.
 *
 * No mocks: the tools open a page, read its text, take a real screenshot and scroll it, all in the
 * session the first call created. The run needs BROWSER_CDP_URL (a resumable endpoint) and a
 * database, so it is skipped rather than faked when either is absent.
 */
const endpoint = process.env.BROWSER_CDP_URL?.trim();
const hasDb = Boolean(process.env.DATABASE_URL?.trim());
const organizationId = process.env.BROWSER_TEST_ORG ?? "";
const userId = process.env.BROWSER_TEST_USER ?? "";
const enabled = Boolean(endpoint && hasDb && organizationId && userId);

const call = (tools: Record<string, unknown>, name: string, input: unknown) =>
  (tools[name] as { execute: (i: never) => Promise<unknown> }).execute(input as never);

describe.skipIf(!enabled)("agent browser tools against real Chromium", () => {
  it("navigates, reads, screenshots and scrolls in one adopted session", async () => {
    const tools = createBrowserTools({ organizationId, userId }) as unknown as Record<string, unknown>;

    const navigated = (await call(tools, "browserNavigate", { url: "https://example.com" })) as {
      url?: string;
      sessionId?: string;
    };
    expect(navigated.sessionId).toBeTruthy();
    expect(String(navigated.url ?? "")).toContain("example.com");

    const read = (await call(tools, "browserRead", { maxChars: 400 })) as {
      text?: string;
      url?: string;
      sessionId?: string;
    };
    // The page is served in the session locale (ar-AE), so the assertion is on real content and on
    // the identity of the page, not on an English phrase.
    expect(String(read.text ?? "").trim().length).toBeGreaterThan(40);
    expect(String(read.url ?? "")).toContain("example.com");
    expect(read.sessionId).toBe(navigated.sessionId);

    const shot = (await call(tools, "browserScreenshot", { label: "agent-evidence" })) as {
      bytes?: number;
      evidenceUrl?: string;
    };
    expect(String(shot.evidenceUrl ?? "")).toContain("/evidence/");
    const evidenceId = String(shot.evidenceUrl).split("/").pop() ?? "";
    expect(evidenceId.length).toBeGreaterThan(10);

    const scrolled = (await call(tools, "browserScroll", { deltaY: 300 })) as { ok?: boolean };
    expect(scrolled.ok ?? true).toBe(true);

    const evidence = await listEvidence(organizationId, String(navigated.sessionId), 10);
    const captured = evidence.find((row) => row.id === evidenceId);
    expect(captured).toBeTruthy();
    expect(Number(captured?.bytes ?? 0)).toBeGreaterThan(1000);
  }, 180_000);

  afterAll(async () => {
    const { browserRuntime } = await import("@/lib/browser/runtime");
    await browserRuntime().closeAll();
  });
});
