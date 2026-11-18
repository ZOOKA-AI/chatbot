import { and, asc, desc, eq, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import * as schema from "@/lib/db/schema";
import { ensureLiveBrowser } from "./resume";
import { browserRuntime } from "@/lib/browser/runtime";
import {
  hasPersistentHandle,
  persistentEngine,
  persistentInput,
  releasePersistentSession,
  startPersistentSession,
} from "./cdp-adapter";

/**
 * Browser session lifecycle and control authorization.
 *
 * The status is a small state machine, and the machine is the permission model: a stopped session
 * cannot be resumed, a paused one cannot be typed into, and a session held by a person cannot be
 * driven by the agent until control is handed back. Every operation re-reads the row filtered by the
 * caller's workspace, so possession of an id is never possession of a session.
 */

export const SESSION_STATUSES = [
  "created",
  "starting",
  "ready",
  "running",
  "paused",
  "taken_over",
  "stopping",
  "stopped",
  "expired",
  "failed",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type ControlAction = "start" | "pause" | "resume" | "take_over" | "return_control" | "stop";

const TRANSITIONS: Record<ControlAction, SessionStatus[]> = {
  start: ["created", "failed"],
  pause: ["ready", "running"],
  resume: ["paused"],
  take_over: ["ready", "running", "paused"],
  return_control: ["taken_over"],
  stop: ["created", "starting", "ready", "running", "paused", "taken_over", "failed"],
};

const TERMINAL: SessionStatus[] = ["stopped", "expired"];

export class BrowserControlError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "BrowserControlError";
  }
}

export type Caller = { userId: string; organizationId: string; role: string };

export function canControl(session: { ownerId: string }, caller: Caller): boolean {
  if (session.ownerId === caller.userId) return true;
  return caller.role === "owner" || caller.role === "admin";
}

export function nextStatus(current: SessionStatus, action: ControlAction): SessionStatus | null {
  if (!TRANSITIONS[action].includes(current)) return null;
  switch (action) {
    case "start":
      return "ready";
    case "pause":
      return "paused";
    case "resume":
      return "running";
    case "take_over":
      return "taken_over";
    case "return_control":
      return "running";
    case "stop":
      return "stopped";
  }
}

export function isTerminal(status: string): boolean {
  return (TERMINAL as string[]).includes(status);
}

/**
 * Whether the agent may act right now.
 *
 * Pause and take-over are only meaningful if they stop the agent, so the agent asks this before
 * every step and gets a refusal that names the reason. A person holding control means exactly that:
 * the agent waits.
 */
export function agentMayAct(session: {
  status: string;
  controlHolder: string;
  expiresAt: Date | string;
}): { ok: true } | { ok: false; reason: string } {
  if (isTerminal(session.status)) return { ok: false, reason: "session_ended" };
  if (new Date(session.expiresAt).getTime() < Date.now()) return { ok: false, reason: "session_expired" };
  if (session.controlHolder !== "agent") return { ok: false, reason: "human_has_control" };
  if (session.status === "paused") return { ok: false, reason: "session_paused" };
  if (!["ready", "running"].includes(session.status)) return { ok: false, reason: `session_${session.status}` };
  return { ok: true };
}

export async function createSession(input: {
  organizationId: string;
  ownerId: string;
  projectId?: string | null;
  taskId?: string | null;
  startUrl?: string | null;
  ttlMinutes?: number;
}) {
  const ttl = Math.min(Math.max(input.ttlMinutes ?? 30, 5), 180);
  const [row] = await db
    .insert(schema.browserSession)
    .values({
      organizationId: input.organizationId,
      ownerId: input.ownerId,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      startUrl: input.startUrl ?? null,
      status: "created",
      expiresAt: new Date(Date.now() + ttl * 60_000),
    })
    .returning();
  return row;
}

export async function getSession(organizationId: string, sessionId: string) {
  const [row] = await db
    .select()
    .from(schema.browserSession)
    .where(and(eq(schema.browserSession.id, sessionId), eq(schema.browserSession.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listSessions(organizationId: string, limit = 20) {
  return db
    .select()
    .from(schema.browserSession)
    .where(eq(schema.browserSession.organizationId, organizationId))
    .orderBy(desc(schema.browserSession.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

export async function appendEvent(input: {
  organizationId: string;
  sessionId: string;
  kind: string;
  actor?: "agent" | "human" | "system";
  detail?: Record<string, unknown>;
}) {
  const [next] = await db
    .select({ seq: sql<number>`coalesce(max(${schema.browserEvent.seq}), 0) + 1` })
    .from(schema.browserEvent)
    .where(eq(schema.browserEvent.sessionId, input.sessionId));
  const [row] = await db
    .insert(schema.browserEvent)
    .values({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      seq: Number(next?.seq ?? 1),
      kind: input.kind.slice(0, 32),
      actor: input.actor ?? "agent",
      detail: input.detail ?? {},
    })
    .returning();
  return row;
}

export async function listEvents(organizationId: string, sessionId: string, limit = 100) {
  return db
    .select()
    .from(schema.browserEvent)
    .where(
      and(eq(schema.browserEvent.sessionId, sessionId), eq(schema.browserEvent.organizationId, organizationId))
    )
    .orderBy(asc(schema.browserEvent.seq))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function recordEvidence(input: {
  organizationId: string;
  sessionId: string;
  label: string;
  url: string | null;
  title: string | null;
  path: string;
  bytes: number;
}) {
  const [row] = await db
    .insert(schema.browserEvidence)
    .values({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      label: input.label.slice(0, 120),
      url: input.url,
      title: input.title,
      path: input.path,
      bytes: input.bytes,
    })
    .returning();
  return row;
}

export async function listEvidence(organizationId: string, sessionId: string, limit = 30) {
  return db
    .select()
    .from(schema.browserEvidence)
    .where(
      and(eq(schema.browserEvidence.sessionId, sessionId), eq(schema.browserEvidence.organizationId, organizationId))
    )
    .orderBy(desc(schema.browserEvidence.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

async function update(organizationId: string, sessionId: string, patch: Record<string, unknown>) {
  const [row] = await db
    .update(schema.browserSession)
    .set({ ...patch, lastSeenAt: new Date() })
    .where(
      and(eq(schema.browserSession.id, sessionId), eq(schema.browserSession.organizationId, organizationId))
    )
    .returning();
  return row ?? null;
}

/**
 * Apply a control action. Authorization, expiry and the state machine are checked here, so a route
 * handler cannot grant a transition the session does not allow.
 */
export async function controlSession(input: {
  caller: Caller;
  sessionId: string;
  action: ControlAction;
}): Promise<{ session: typeof schema.browserSession.$inferSelect; events: string[] }> {
  const session = await getSession(input.caller.organizationId, input.sessionId);
  if (!session) throw new BrowserControlError("session_not_found");
  if (!canControl(session, input.caller)) throw new BrowserControlError("not_session_owner");

  const status = session.status as SessionStatus;
  if (isTerminal(status)) throw new BrowserControlError("session_ended");
  if (new Date(session.expiresAt).getTime() < Date.now() && input.action !== "stop") {
    await expireSession(input.caller.organizationId, input.sessionId);
    throw new BrowserControlError("session_expired");
  }

  const target = nextStatus(status, input.action);
  if (!target) throw new BrowserControlError(`cannot_${input.action}_from_${status}`);

  const events: string[] = [input.action];

  if (input.action === "start") {
    // A configured persistent engine is preferred over an in-process Playwright browser: its context
    // belongs to Chromium, so the tab survives the worker that opened it. Playwright remains the
    // fallback for environments where no engine is configured.
    if (persistentEngine()) {
      const opened = await startPersistentSession({
        organizationId: input.caller.organizationId,
        startUrl: session.startUrl,
      });
      if (opened.ok === false) {
        await update(input.caller.organizationId, input.sessionId, {
          status: "failed",
          lastError: `${opened.code}: ${opened.message}`.trim(),
        });
        await appendEvent({
          organizationId: input.caller.organizationId,
          sessionId: input.sessionId,
          kind: "session_failed",
          actor: "system",
          detail: { reason: opened.code, engine: "persistent" },
        });
        throw new BrowserControlError("runtime_unavailable");
      }
      const started = await update(input.caller.organizationId, input.sessionId, {
        status: target,
        startedAt: new Date(),
        currentUrl: opened.value.url,
        currentTitle: opened.value.title,
        lastError: null,
        browserContextId: opened.value.browserContextId,
        targetId: opened.value.targetId,
      });
      await appendEvent({
        organizationId: input.caller.organizationId,
        sessionId: input.sessionId,
        kind: "session_started",
        actor: "human",
        detail: { url: opened.value.url, engine: "persistent" },
      });
      return { session: started ?? session, events };
    }

    const opened = await browserRuntime().open(input.sessionId, input.caller.organizationId);
    if (!("ok" in opened) || opened.ok !== true) {
      await update(input.caller.organizationId, input.sessionId, {
        status: "failed",
        // Keep the engine's own words next to the code so the panel and the operator see a reason
        // rather than a bare "unavailable".
        lastError: "code" in opened ? `${opened.code}: ${opened.message ?? ""}`.trim() : "launch_failed",
      });
      await appendEvent({
        organizationId: input.caller.organizationId,
        sessionId: input.sessionId,
        kind: "session_failed",
        actor: "system",
        detail: { reason: "code" in opened ? opened.code : "launch_failed" },
      });
      throw new BrowserControlError("runtime_unavailable");
    }
    let url: string | null = session.startUrl;
    let title: string | null = null;
    if (session.startUrl) {
      const navigated = await browserRuntime().navigate(
        input.sessionId,
        input.caller.organizationId,
        session.startUrl
      );
      if (!("ok" in navigated) || navigated.ok !== true) {
        const code = "code" in navigated ? navigated.code : "navigation_failed";
        await update(input.caller.organizationId, input.sessionId, { status: "failed", lastError: code });
        await appendEvent({
          organizationId: input.caller.organizationId,
          sessionId: input.sessionId,
          kind: "navigation_refused",
          actor: "system",
          detail: { reason: code },
        });
        throw new BrowserControlError(code.startsWith("url_refused") ? "start_url_refused" : "navigation_failed");
      }
      url = navigated.url;
      title = navigated.title;
      events.push("navigated");
    }
    const started = await update(input.caller.organizationId, input.sessionId, {
      status: target,
      startedAt: new Date(),
      currentUrl: url,
      currentTitle: title,
      lastError: null,
    });
    await appendEvent({
      organizationId: input.caller.organizationId,
      sessionId: input.sessionId,
      kind: "session_started",
      actor: "human",
      detail: { url },
    });
    return { session: started ?? session, events };
  }

  if (input.action === "stop") {
    await browserRuntime().close(input.sessionId);
    if (hasPersistentHandle(session)) await releasePersistentSession(session).catch(() => false);
    const stopped = await update(input.caller.organizationId, input.sessionId, {
      status: "stopped",
      endedAt: new Date(),
      controlHolder: "agent",
    });
    await appendEvent({
      organizationId: input.caller.organizationId,
      sessionId: input.sessionId,
      kind: "session_stopped",
      actor: "human",
    });
    return { session: stopped ?? session, events };
  }

  const patch: Record<string, unknown> = { status: target };
  if (input.action === "take_over") patch.controlHolder = "human";
  if (input.action === "return_control") patch.controlHolder = "agent";

  const updated = await update(input.caller.organizationId, input.sessionId, patch);
  const KIND: Record<ControlAction, string> = {
    start: "session_started",
    pause: "session_paused",
    resume: "session_resumed",
    take_over: "session_taken_over",
    return_control: "control_returned",
    stop: "session_stopped",
  };
  await appendEvent({
    organizationId: input.caller.organizationId,
    sessionId: input.sessionId,
    kind: KIND[input.action],
    actor: "human",
  });
  return { session: updated ?? session, events };
}

export type InputCommand =
  | { kind: "click"; x: number; y: number }
  | { kind: "type"; text: string; submit?: boolean }
  | { kind: "key"; key: string }
  | { kind: "scroll"; deltaY: number }
  | { kind: "navigate"; url: string };

/**
 * A person driving the live page.
 *
 * Take-over is only real if it lets someone touch the page, so this path exists, and it is guarded by
 * the control holder: if the agent holds control, a human input is refused rather than interleaved
 * with the agent's own steps. Every command is recorded on the timeline with who did it.
 */
export async function applyInput(input: {
  caller: Caller;
  sessionId: string;
  command: InputCommand;
}): Promise<{ session: typeof schema.browserSession.$inferSelect; executed: string }> {
  const session = await getSession(input.caller.organizationId, input.sessionId);
  if (!session) throw new BrowserControlError("session_not_found");
  if (!canControl(session, input.caller)) throw new BrowserControlError("not_session_owner");
  if (isTerminal(session.status)) throw new BrowserControlError("session_ended");
  if (new Date(session.expiresAt).getTime() < Date.now()) throw new BrowserControlError("session_expired");
  if (session.controlHolder !== "human") throw new BrowserControlError("agent_has_control");

  if (input.command.kind === "key") throw new BrowserControlError("unsupported_key");

  // An adopted persistent tab is driven directly, with no in-process browser and no adoption step:
  // the context is already Chromium's, so nothing here depends on this worker staying alive.
  if (hasPersistentHandle(session) && persistentEngine()) {
    const applied = await persistentInput({
      row: {
        id: session.id,
        organizationId: session.organizationId,
        browserContextId: session.browserContextId,
        targetId: session.targetId,
      },
      command: input.command,
    });
    if (applied.ok === false) {
      const code = applied.code === "forbidden_workspace" ? "not_session_owner" : applied.code;
      throw new BrowserControlError(code);
    }
    const updated = await update(input.caller.organizationId, input.sessionId, {
      currentUrl: applied.value.url || session.currentUrl,
      currentTitle: applied.value.title || session.currentTitle,
      status: session.status === "ready" ? "running" : session.status,
      lastSeenAt: new Date(),
    });
    await appendEvent({
      organizationId: input.caller.organizationId,
      sessionId: input.sessionId,
      kind: `human_${input.command.kind}`,
      actor: "human",
      // Never the typed text: a person may be typing a password.
      detail:
        input.command.kind === "type"
          ? { characters: input.command.text.length, submit: Boolean(input.command.submit), engine: "persistent" }
          : input.command.kind === "click"
            ? { x: input.command.x, y: input.command.y, engine: "persistent" }
            : input.command.kind === "navigate"
              ? { url: applied.value.url, engine: "persistent" }
              : { engine: "persistent" },
    });
    return { session: updated ?? session, executed: input.command.kind };
  }

  // The browser may be alive in another process; adopt it before declaring the session dead.
  const resumed = await ensureLiveBrowser({
    sessionId: input.sessionId,
    organizationId: input.caller.organizationId,
    preferredUrl: session.currentUrl ?? undefined,
  });
  if (resumed.ok === false) throw new BrowserControlError(resumed.code);
  const health = browserRuntime().health(input.sessionId, input.caller.organizationId);
  if (!health.live) throw new BrowserControlError(health.crashed ?? "session_not_running");

  const runtime = browserRuntime();
  let url = session.currentUrl ?? "";
  let title = session.currentTitle ?? "";

  if (input.command.kind === "click") {
    const result = await runtime.clickPoint(input.sessionId, input.caller.organizationId, input.command);
    if (result.ok === false) throw new BrowserControlError(result.code);
    url = result.url;
  } else if (input.command.kind === "type") {
    const result = await runtime.typeKeys(input.sessionId, input.caller.organizationId, input.command.text, {
      submit: input.command.submit,
    });
    if (result.ok === false) throw new BrowserControlError(result.code);
    url = result.url;
  } else if (input.command.kind === "scroll") {
    const result = await runtime.scroll(input.sessionId, input.caller.organizationId, input.command.deltaY);
    if (result.ok === false) throw new BrowserControlError(result.code);
  } else {
    const result = await runtime.navigate(input.sessionId, input.caller.organizationId, input.command.url);
    if (result.ok === false) throw new BrowserControlError(result.code);
    url = result.url;
    title = result.title;
  }

  const updated = await update(input.caller.organizationId, input.sessionId, {
    currentUrl: url,
    currentTitle: title,
    status: session.status === "ready" ? "running" : session.status,
  });
  await appendEvent({
    organizationId: input.caller.organizationId,
    sessionId: input.sessionId,
    kind: `human_${input.command.kind}`,
    actor: "human",
    // Never the typed text: a person may be typing a password.
    detail:
      input.command.kind === "type"
        ? { characters: input.command.text.length, submit: Boolean(input.command.submit) }
        : input.command.kind === "click"
          ? { x: input.command.x, y: input.command.y }
          : input.command.kind === "navigate"
            ? { url }
            : {},
  });
  return { session: updated ?? session, executed: input.command.kind };
}

/** Sessions that claim to be alive but have no live browser, and crashes Chromium already reported. */
export async function findBroken(
  organizationId: string
): Promise<Array<{ id: string; status: string; reason: string }>> {
  const active = await db
    .select()
    .from(schema.browserSession)
    .where(
      and(
        eq(schema.browserSession.organizationId, organizationId),
        sql`${schema.browserSession.status} IN ('ready','running','paused','taken_over','starting')`
      )
    )
    .limit(20);
  const broken: Array<{ id: string; status: string; reason: string }> = [];
  for (const row of active) {
    const health = browserRuntime().health(row.id, organizationId);
    if (!health.live) broken.push({ id: row.id, status: row.status, reason: health.crashed ?? "browser_missing" });
  }
  return broken;
}

/**
 * Recover a session whose browser died.
 *
 * Recovery is a new browser attached to the same row, navigated back to the last known URL, so the
 * record stays one session. It is guarded by a conditional update on the expected status, so two
 * simultaneous retries cannot both launch a browser and run the customer's steps twice.
 */
export async function recoverSession(input: {
  caller: Caller;
  sessionId: string;
}): Promise<{ session: typeof schema.browserSession.$inferSelect; navigatedTo: string | null }> {
  const session = await getSession(input.caller.organizationId, input.sessionId);
  if (!session) throw new BrowserControlError("session_not_found");
  if (!canControl(session, input.caller)) throw new BrowserControlError("not_session_owner");
  if (isTerminal(session.status)) throw new BrowserControlError("session_ended");
  if (new Date(session.expiresAt).getTime() < Date.now()) throw new BrowserControlError("session_expired");

  const expected = session.status;
  if (!["ready", "running", "paused", "taken_over", "starting", "failed"].includes(expected)) {
    throw new BrowserControlError(`cannot_recover_from_${expected}`);
  }

  // Claim the transition first: whoever sets 'starting' from the expected status owns the recovery.
  const [claimed] = await db
    .update(schema.browserSession)
    .set({ status: "starting", lastSeenAt: new Date() })
    .where(
      and(
        eq(schema.browserSession.id, input.sessionId),
        eq(schema.browserSession.organizationId, input.caller.organizationId),
        eq(schema.browserSession.status, expected)
      )
    )
    .returning();
  if (!claimed) throw new BrowserControlError("recovery_in_progress");

  await browserRuntime().close(input.sessionId);
  const opened = await browserRuntime().open(input.sessionId, input.caller.organizationId);
  if (opened.ok === false) {
    await update(input.caller.organizationId, input.sessionId, { status: "failed", lastError: opened.code });
    await appendEvent({
      organizationId: input.caller.organizationId,
      sessionId: input.sessionId,
      kind: "recovery_failed",
      actor: "system",
      detail: { reason: opened.code },
    });
    throw new BrowserControlError("recovery_failed");
  }

  let navigatedTo: string | null = null;
  if (session.currentUrl) {
    const navigated = await browserRuntime().navigate(input.sessionId, input.caller.organizationId, session.currentUrl);
    if (navigated.ok === false) {
      await update(input.caller.organizationId, input.sessionId, { status: "failed", lastError: navigated.code });
      throw new BrowserControlError("recovery_navigation_failed");
    }
    navigatedTo = navigated.url;
  }

  const recovered = await update(input.caller.organizationId, input.sessionId, {
    status: session.controlHolder === "human" ? "taken_over" : "ready",
    lastError: null,
    lastSeenAt: new Date(),
  });
  await appendEvent({
    organizationId: input.caller.organizationId,
    sessionId: input.sessionId,
    kind: "session_recovered",
    actor: "human",
    detail: { from: expected, navigatedTo },
  });
  return { session: recovered ?? claimed, navigatedTo };
}

/** Mark a session failed when its browser is gone, so the row never claims to be alive. */
export async function markBroken(organizationId: string, sessionId: string, reason: string) {
  const updated = await update(organizationId, sessionId, { status: "failed", lastError: reason });
  await appendEvent({
    organizationId,
    sessionId,
    kind: "browser_terminated",
    actor: "system",
    detail: { reason },
  });
  return updated;
}

export async function expireSession(organizationId: string, sessionId: string) {
  await browserRuntime().close(sessionId);
  const row = await getSession(organizationId, sessionId);
  if (row && hasPersistentHandle(row)) await releasePersistentSession(row).catch(() => false);
  const expired = await update(organizationId, sessionId, { status: "expired", endedAt: new Date() });
  await appendEvent({ organizationId, sessionId, kind: "session_expired", actor: "system" });
  return expired;
}

/** Sweep sessions whose time is up. Called by the worker tick and by the console load. */
export async function expireDueSessions(organizationId: string): Promise<number> {
  const due = await db
    .select({ id: schema.browserSession.id })
    .from(schema.browserSession)
    .where(
      and(
        eq(schema.browserSession.organizationId, organizationId),
        lt(schema.browserSession.expiresAt, new Date()),
        sql`${schema.browserSession.status} NOT IN ('stopped','expired','failed')`
      )
    )
    .limit(20);
  for (const row of due) {
    await expireSession(organizationId, row.id);
  }
  return due.length;
}
