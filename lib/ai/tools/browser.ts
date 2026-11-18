import { tool } from "ai";
import { z } from "zod";

import { browserRuntime } from "@/lib/browser/runtime";
import { ensureLiveBrowser } from "@/lib/browser/resume";
import {
  agentMayAct,
  appendEvent,
  controlSession,
  createSession,
  getSession,
  listSessions,
  recordEvidence,
} from "@/lib/browser/sessions";

/**
 * Browsing, as the model's own hands.
 *
 * The tools drive the same real Chromium the workspace panel drives, through the same session table,
 * the same URL policy and the same timeline, so what the model does is visible in the panel and in
 * the audit trail instead of happening invisibly. Nothing here launches its own browser or keeps a
 * module-level singleton: a singleton would be shared by every tenant that hits the same warm
 * function, which is the one thing this codebase must never do.
 *
 * Which engine serves the browser is decided in lib/browser/runtime.ts: Browserless, another remote
 * DevTools endpoint, or a local Chromium in development.
 *
 * Read-only tools run directly. Anything that can submit, buy, publish or delete needs approval,
 * because a click in the wrong place is an irreversible external action.
 */

const SESSION_TTL_MINUTES = 30;

type BrowserToolContext = { organizationId: string; userId: string };

export function createBrowserTools({ organizationId, userId }: BrowserToolContext) {
  const caller = { userId, organizationId, role: "owner" };

  /**
   * The session this conversation keeps browsing in. A live session owned by the same user is
   * reused so steps continue in one page; otherwise a new session is opened and started, which is
   * what turns a stored row into a real Chromium page.
   */
  async function ensureSession() {
    const recent = await listSessions(organizationId, 5);
    // A live tab may belong to another process: every tool call in production lands on a different
    // function instance. Adopting it keeps the agent in one page instead of opening a second
    // browser and losing what it just did.
    for (const row of recent) {
      if (row.ownerId !== userId) continue;
      if (row.status !== "ready" && row.status !== "running") continue;
      if (new Date(row.expiresAt).getTime() <= Date.now()) continue;
      const resumed = await ensureLiveBrowser({
        sessionId: row.id,
        organizationId,
        preferredUrl: row.currentUrl ?? undefined,
      });
      if (resumed.ok) return row;
    }

    const created = await createSession({
      organizationId,
      ownerId: userId,
      ttlMinutes: SESSION_TTL_MINUTES,
    });
    await controlSession({ caller, sessionId: created.id, action: "start" });
    return (await getSession(organizationId, created.id)) ?? created;
  }

  /** Every tool answers the same way, so the model can read a refusal instead of guessing. */
  async function step<T>(
    kind: string,
    detail: Record<string, unknown>,
    run: (sessionId: string) => Promise<T | { ok: false; code: string; message: string }>
  ): Promise<{ ok: boolean; reason?: string; message?: string } & Record<string, unknown>> {
    let session: Awaited<ReturnType<typeof ensureSession>>;
    try {
      session = await ensureSession();
    } catch {
      return { ok: false, reason: "session_unavailable", message: "browser_unavailable" };
    }

    const permission = agentMayAct(session);
    if (!permission.ok) {
      return { ok: false, reason: permission.reason, message: "التحكم في المتصفح ليس بيد الوكيل الآن." };
    }

    const result = await run(session.id);
    await appendEvent({ organizationId, sessionId: session.id, kind, detail });
    return typeof result === "object" && result !== null
      ? ({ sessionId: session.id, ...result } as { ok: boolean } & Record<string, unknown>)
      : { ok: true, sessionId: session.id };
  }

  return {
    browserNavigate: tool({
      description:
        "Opens a URL in the workspace browser. Use it when the customer asks to open, check or read a specific site.",
      inputSchema: z.object({ url: z.string().describe("الرابط الكامل http أو https") }),
      execute: async ({ url }) =>
        step("navigate", { url }, async (sessionId) => {
          const result = await browserRuntime().navigate(sessionId, organizationId, url);
          return result as { ok: false; code: string; message: string } | Record<string, unknown>;
        }),
    }),

    browserRead: tool({
      description:
        "Reads the visible text of the current page or of one element in it. Returns the page URL and title with the text.",
      inputSchema: z.object({
        selector: z.string().optional().describe("CSS selector لعنصر محدد، اتركه فارغًا لقراءة الصفحة"),
        maxChars: z.number().min(200).max(20000).optional(),
      }),
      execute: async ({ selector, maxChars }) =>
        step("read", { selector: selector ?? null }, async (sessionId) =>
          (await browserRuntime().read(sessionId, organizationId, { selector, maxChars })) as
            | { ok: false; code: string; message: string }
            | Record<string, unknown>
        ),
    }),

    browserScreenshot: tool({
      description:
        "Takes a screenshot of the current page and stores it as evidence the customer can open.",
      inputSchema: z.object({
        label: z.string().optional().describe("اسم قصير للصورة"),
      }),
      execute: async ({ label }) =>
        step("screenshot", { label: label ?? null }, async (sessionId) => {
          const shot = await browserRuntime().screenshot(sessionId, organizationId, label ?? "frame");
          if (!shot.ok) return shot;
          const evidence = await recordEvidence({
            organizationId,
            sessionId,
            label: label ?? "frame",
            url: shot.url,
            title: shot.title,
            path: shot.path,
            bytes: shot.bytes,
          });
          return {
            ok: true,
            url: shot.url,
            title: shot.title,
            bytes: shot.bytes,
            evidenceUrl: `/api/workspace/browser/sessions/${sessionId}/evidence/${evidence?.id ?? ""}`,
          };
        }),
    }),

    browserClick: tool({
      description:
        "Clicks one element in the current page. Anything that submits a form or could spend money needs the customer's approval first.",
      inputSchema: z.object({ selector: z.string().describe("CSS selector للعنصر") }),
      needsApproval: true,
      execute: async ({ selector }) =>
        step("click", { selector }, async (sessionId) =>
          (await browserRuntime().click(sessionId, organizationId, selector)) as
            | { ok: false; code: string; message: string }
            | Record<string, unknown>
        ),
    }),

    browserType: tool({
      description: "Types text into a field on the current page, after the customer approves the action.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector للحقل"),
        text: z.string().describe("النص المطلوب كتابته"),
      }),
      needsApproval: true,
      execute: async ({ selector, text }) =>
        step("type", { selector, chars: text.length }, async (sessionId) =>
          (await browserRuntime().type(sessionId, organizationId, selector, text)) as
            | { ok: false; code: string; message: string }
            | Record<string, unknown>
        ),
    }),

    browserScroll: tool({
      description: "Scrolls the current page vertically, positive values go down.",
      inputSchema: z.object({ deltaY: z.number().min(-5000).max(5000).default(600) }),
      execute: async ({ deltaY }) =>
        step("scroll", { deltaY }, async (sessionId) =>
          (await browserRuntime().scroll(sessionId, organizationId, deltaY)) as
            | { ok: false; code: string; message: string }
            | Record<string, unknown>
        ),
    }),

    browserStatus: tool({
      description: "Reports whether a browser is open for this workspace and which page it is on.",
      inputSchema: z.object({}),
      execute: async () => {
        const recent = await listSessions(organizationId, 5);
        const live = recent.find(
          (row) =>
            row.ownerId === userId &&
            (row.status === "ready" || row.status === "running") &&
            new Date(row.expiresAt).getTime() > Date.now()
        );
        if (!live) {
          return { ok: true, open: false, engine: browserRuntime().engine() };
        }
        return {
          ok: true,
          open: browserRuntime().has(live.id, organizationId),
          sessionId: live.id,
          url: live.currentUrl,
          title: live.currentTitle,
          engine: browserRuntime().engine(),
        };
      },
    }),
  };
}
