import type { WorkerTool } from "../worker-types";
import { redact } from "../worker-types";
import { browserRuntime } from "@/lib/browser/runtime";
import {
  agentMayAct,
  appendEvent,
  createSession,
  getSession,
  listEvents,
  recordEvidence,
  controlSession,
  type Caller,
} from "@/lib/browser/sessions";

/**
 * Drives a real browser on the customer's behalf.
 *
 * The tool does not describe browsing, it does it: Chromium launches, the steps run in order, each
 * one is written to the session timeline, screenshots are stored, and the session is always closed
 * at the end even when a step fails. A step that would spend money, publish, message someone,
 * delete something or change account security is refused outright: this milestone has no channel
 * for a human to approve it mid-run, and a refusal is the only honest answer.
 *
 * The workspace comes from the worker context, never from the payload, so a crafted request cannot
 * open a browser in someone else's workspace.
 */

const CONSEQUENTIAL = new Set(["purchase", "payment", "publish", "message", "delete", "security_change", "submit_final"]);

type Step = {
  action: string;
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  deltaY?: number;
  label?: string;
};

function parseSteps(raw: unknown): Step[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null;
  const allowed = new Set(["navigate", "click", "type", "select", "scroll", "read", "screenshot", "consequential"]);
  const steps: Step[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") return null;
    const step = candidate as Record<string, unknown>;
    const action = typeof step.action === "string" ? step.action : "";
    if (!allowed.has(action)) return null;
    steps.push({
      action,
      url: typeof step.url === "string" ? step.url : undefined,
      selector: typeof step.selector === "string" ? step.selector : undefined,
      text: typeof step.text === "string" ? step.text : undefined,
      value: typeof step.value === "string" ? step.value : undefined,
      deltaY: typeof step.deltaY === "number" ? step.deltaY : undefined,
      label: typeof step.label === "string" ? step.label : undefined,
    });
  }
  return steps;
}

export const browserTaskRun: WorkerTool = {
  name: "browser_task_run",
  description:
    "Open a real browser session for a customer instruction and run a short sequence of browsing steps, recording a timeline and screenshots.",
  readOnly: false,
  internalWrite: true,
  // A browser run touches the network and a real page, so it gets a longer budget than a query
  // and no automatic retry: a retried click could press the same button twice.
  timeoutMs: 120_000,
  maxAttempts: 1,
  async run(context) {
    const steps = parseSteps(context.payload.steps);
    if (!steps) return { ok: false, error: "invalid_steps", summary: "refused: invalid_steps" };

    const startUrl = typeof context.payload.startUrl === "string" ? context.payload.startUrl : undefined;
    if (!startUrl) return {
      ok: false,
      error: "start_url_required",
      summary: "refused: a start URL is required",
    };
    if (steps.length === 0) return { ok: false, error: "invalid_steps", summary: "refused: invalid_steps" };

    // A consequential step has no approval path in this milestone, so the run is refused before a
    // browser is opened rather than stopped halfway through a purchase.
    const consequential = steps.filter((step) => step.action === "consequential" || CONSEQUENTIAL.has(step.action));
    if (consequential.length > 0) {
      return {
        ok: false,
        error: "consequential_step_requires_approval",
        summary: `refused: step "${consequential[0].action}" needs human approval, which this run cannot obtain`,
      };
    }

    const caller: Caller = {
      userId: "worker",
      organizationId: context.organizationId,
      role: "agent",
    };

    const session = await createSession({
      organizationId: context.organizationId,
      ownerId: context.agentId,
      taskId: context.taskId ?? null,
      startUrl,
      ttlMinutes: 15,
    });

    const lines: string[] = [];
    let failed: string | null = null;

    const started = await controlSession({ caller: { ...caller, role: "owner" }, sessionId: session.id, action: "start" }).catch(
      (error: unknown) => error
    );
    if (started instanceof Error) {
      const code = (started as { code?: string }).code ?? "start_failed";
      return { ok: false, error: code, summary: `refused: ${code}` };
    }
    lines.push(`session ${session.id.slice(0, 8)} opened`);

    try {
      for (const [index, step] of steps.entries()) {
        const position = index + 1;
        // A pause, a take-over or an expiry stops the run here rather than after the next click.
        const current = await getSession(context.organizationId, session.id);
        const verdict = current ? agentMayAct(current) : { ok: false as const, reason: "session_missing" };
        if (verdict.ok === false) {
          failed = verdict.reason;
          lines.push(`${position}. stopped before "${step.action}": ${verdict.reason}`);
          break;
        }
        if (step.action === "navigate") {
          const result = await browserRuntime().navigate(session.id, context.organizationId, step.url ?? "");
          if ("ok" in result && result.ok) {
            lines.push(`${position}. navigate → ${result.url} (${result.title.slice(0, 60)})`);
            await appendEvent({
              organizationId: context.organizationId,
              sessionId: session.id,
              kind: "navigate",
              detail: { url: result.url, title: result.title.slice(0, 120) },
            });
          } else {
            failed = "code" in result ? result.code : "navigation_failed";
            lines.push(`${position}. navigate failed: ${failed}`);
            break;
          }
          continue;
        }
        if (step.action === "click") {
          const result = await browserRuntime().click(session.id, context.organizationId, step.selector ?? "");
          if ("ok" in result && result.ok) {
            lines.push(`${position}. click ${step.selector}`);
            await appendEvent({ organizationId: context.organizationId, sessionId: session.id, kind: "click", detail: { selector: step.selector } });
          } else {
            failed = "code" in result ? result.code : "click_failed";
            lines.push(`${position}. click failed: ${failed}`);
            break;
          }
          continue;
        }
        if (step.action === "type") {
          const result = await browserRuntime().type(
            session.id,
            context.organizationId,
            step.selector ?? "",
            redact(step.text ?? "")
          );
          if ("ok" in result && result.ok) {
            lines.push(`${position}. type into ${step.selector}`);
            // The value is redacted before it reaches the timeline: a typed password must not be
            // readable later from the session record.
            await appendEvent({
              organizationId: context.organizationId,
              sessionId: session.id,
              kind: "type",
              detail: { selector: step.selector, characters: (step.text ?? "").length },
            });
          } else {
            failed = "code" in result ? result.code : "type_failed";
            lines.push(`${position}. type failed: ${failed}`);
            break;
          }
          continue;
        }
        if (step.action === "select") {
          const result = await browserRuntime().select(
            session.id,
            context.organizationId,
            step.selector ?? "",
            step.value ?? ""
          );
          if ("ok" in result && result.ok) {
            lines.push(`${position}. select ${step.value} in ${step.selector}`);
          } else {
            failed = "code" in result ? result.code : "select_failed";
            lines.push(`${position}. select failed: ${failed}`);
            break;
          }
          continue;
        }
        if (step.action === "scroll") {
          const result = await browserRuntime().scroll(session.id, context.organizationId, step.deltaY ?? 600);
          if ("ok" in result && result.ok) {
            lines.push(`${position}. scroll to ${result.scrollY}px`);
          } else {
            failed = "code" in result ? result.code : "scroll_failed";
            break;
          }
          continue;
        }
        if (step.action === "read") {
          const result = await browserRuntime().read(session.id, context.organizationId, {
            selector: step.selector,
            maxChars: 1500,
          });
          if ("ok" in result && result.ok) {
            lines.push(`${position}. read ${result.text.length} characters from ${result.url}`);
            await appendEvent({
              organizationId: context.organizationId,
              sessionId: session.id,
              kind: "read",
              detail: { url: result.url, characters: result.text.length },
            });
          } else {
            failed = "code" in result ? result.code : "read_failed";
            break;
          }
          continue;
        }
        if (step.action === "screenshot") {
          const result = await browserRuntime().screenshot(
            session.id,
            context.organizationId,
            step.label ?? `step-${position}`
          );
          if ("ok" in result && result.ok) {
            await recordEvidence({
              organizationId: context.organizationId,
              sessionId: session.id,
              label: step.label ?? `step-${position}`,
              url: result.url,
              title: result.title.slice(0, 200),
              path: result.path,
              bytes: result.bytes,
            });
            lines.push(`${position}. screenshot saved (${result.bytes} bytes)`);
          } else {
            failed = "code" in result ? result.code : "screenshot_failed";
            break;
          }
        }
      }

      const finalRead = await browserRuntime().read(session.id, context.organizationId, { maxChars: 400 });
      const summary = [
        failed ? `stopped: ${failed}` : "completed",
        ...lines,
        "ok" in finalRead && finalRead.ok ? `page: ${finalRead.url}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const evidence = { sessionId: session.id, steps: steps.length };
      return failed
        ? { ok: false, error: failed, summary: redact(summary) }
        : { ok: true, summary: redact(summary), evidence };
    } finally {
      const events = await listEvents(context.organizationId, session.id, 1).catch(() => []);
      await controlSession({ caller: { ...caller, role: "owner" }, sessionId: session.id, action: "stop" }).catch(
        () => undefined
      );
      void events;
    }
  },
};
