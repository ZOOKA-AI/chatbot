import { and, asc, desc, eq, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import * as schema from "@/lib/db/schema";
import { browserRuntime } from "@/lib/browser/runtime";

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
    const opened = await browserRuntime().open(input.sessionId, input.caller.organizationId);
    if (!("ok" in opened) || opened.ok !== true) {
      await update(input.caller.organizationId, input.sessionId, {
        status: "failed",
        lastError: "code" in opened ? opened.code : "launch_failed",
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

export async function expireSession(organizationId: string, sessionId: string) {
  await browserRuntime().close(sessionId);
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
