import "server-only";

import { and, desc, eq, isNull, ne } from "drizzle-orm";

import * as queriesModule from "@/lib/db/queries";
import { commanderActiveDb } from "@/lib/db/tenant-context";
import {
  agentExecution,
  agentIdentity,
  agentProject,
  agentSchedule,
  agentTask,
} from "@/lib/db/schema";

/**
 * Workspace projects: the container that agent work belongs to.
 *
 * Every function takes the organisation from the caller and never from a request body, and
 * every query carries it. A project belonging to another workspace is reported as missing
 * rather than forbidden, so the difference cannot be used to discover that it exists.
 *
 * Deleting is archiving. Task and execution rows are the record that work really happened, so
 * they survive; a project is only removed outright when nothing was ever recorded under it.
 */

const db = new Proxy({} as typeof queriesModule.db, {
  get(_target, property) {
    const active = commanderActiveDb() as Record<PropertyKey, unknown> | null;
    const source = active ?? (queriesModule.db as unknown as Record<PropertyKey, unknown>);
    const value = Reflect.get(source, property, source);
    return typeof value === "function" ? value.bind(source) : value;
  },
}) as typeof queriesModule.db;

export const PROJECT_STATUSES = ["active", "paused", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectRow = typeof agentProject.$inferSelect;

const NAME_LIMIT = 200;

function cleanName(value: unknown): string | null {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > NAME_LIMIT) return null;
  return name;
}

export type ProjectPatch = {
  name?: unknown;
  summary?: unknown;
  status?: unknown;
  brief?: unknown;
  siteProjectId?: unknown;
};

export type ProjectPatchResult =
  | { ok: true; project: ProjectRow }
  | { ok: false; error: string };

function isUniqueViolation(error: unknown): boolean {
  const text = String((error as { message?: string })?.message ?? error);
  return text.includes("AgentProject_organizationId_name_key") || text.includes("duplicate key value");
}

export async function createProject(input: {
  organizationId: string;
  name: unknown;
  summary?: unknown;
  brief?: unknown;
  siteProjectId?: unknown;
  createdBy?: string;
}): Promise<{ ok: true; project: ProjectRow } | { ok: false; error: string }> {
  const name = cleanName(input.name);
  if (!name) return { ok: false, error: "invalid_name" };

  const summary = input.summary === undefined || input.summary === null ? null : String(input.summary).slice(0, 2000);
  const brief =
    input.brief && typeof input.brief === "object" && !Array.isArray(input.brief)
      ? (input.brief as Record<string, unknown>)
      : null;

  try {
    const [project] = await db
      .insert(agentProject)
      .values({
        organizationId: input.organizationId,
        name,
        summary,
        brief,
        siteProjectId: typeof input.siteProjectId === "string" ? input.siteProjectId : null,
        createdBy: input.createdBy ?? "owner",
      })
      .returning();
    return { ok: true, project };
  } catch (error) {
    // The unique index is the real guard against two projects with one name; reporting it as a
    // taken name is more useful than surfacing a driver error to the customer.
    if (isUniqueViolation(error)) return { ok: false, error: "name_taken" };
    throw error;
  }
}

export async function listProjects(organizationId: string, limit = 50): Promise<ProjectRow[]> {
  return db
    .select()
    .from(agentProject)
    .where(eq(agentProject.organizationId, organizationId))
    .orderBy(desc(agentProject.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getProject(input: {
  organizationId: string;
  projectId: string;
}): Promise<ProjectRow | null> {
  const [row] = await db
    .select()
    .from(agentProject)
    .where(and(eq(agentProject.id, input.projectId), eq(agentProject.organizationId, input.organizationId)))
    .limit(1);
  return row ?? null;
}

/** Looks a project up by name, which is how the runner resolves a customer's chosen project. */
export async function getProjectByName(input: {
  organizationId: string;
  name: string;
}): Promise<ProjectRow | null> {
  const [row] = await db
    .select()
    .from(agentProject)
    .where(and(eq(agentProject.organizationId, input.organizationId), eq(agentProject.name, input.name)))
    .limit(1);
  return row ?? null;
}

export async function updateProject(input: {
  organizationId: string;
  projectId: string;
  patch: ProjectPatch;
}): Promise<ProjectPatchResult> {
  const existing = await getProject({ organizationId: input.organizationId, projectId: input.projectId });
  if (!existing) return { ok: false, error: "not_found" };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.patch.name !== undefined) {
    const name = cleanName(input.patch.name);
    if (!name) return { ok: false, error: "invalid_name" };
    patch.name = name;
  }
  if (input.patch.summary !== undefined) {
    patch.summary = input.patch.summary === null ? null : String(input.patch.summary).slice(0, 2000);
  }
  if (input.patch.status !== undefined) {
    const status = String(input.patch.status);
    if (!PROJECT_STATUSES.includes(status as ProjectStatus)) return { ok: false, error: "invalid_status" };
    patch.status = status;
  }
  if (input.patch.brief !== undefined) {
    patch.brief =
      input.patch.brief && typeof input.patch.brief === "object" && !Array.isArray(input.patch.brief)
        ? input.patch.brief
        : null;
  }
  if (input.patch.siteProjectId !== undefined) {
    patch.siteProjectId = typeof input.patch.siteProjectId === "string" ? input.patch.siteProjectId : null;
  }

  if (Object.keys(patch).length === 1) return { ok: false, error: "empty_patch" };

  try {
    const [project] = await db
      .update(agentProject)
      .set(patch)
      .where(and(eq(agentProject.id, input.projectId), eq(agentProject.organizationId, input.organizationId)))
      .returning();
    return { ok: true, project };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "name_taken" };
    throw error;
  }
}

/**
 * Removes a project.
 *
 * Archived rather than destroyed while any work is recorded against it: the tasks and their
 * execution evidence are the proof that something really ran, and deleting the container must
 * not delete that proof. Only a project with no tasks and no schedules is deleted outright.
 */
export async function deleteProject(input: {
  organizationId: string;
  projectId: string;
}): Promise<{ ok: true; mode: "deleted" | "archived"; keptTasks: number } | { ok: false; error: string }> {
  const existing = await getProject(input);
  if (!existing) return { ok: false, error: "not_found" };

  const tasks = await db
    .select({ id: agentTask.id })
    .from(agentTask)
    .where(and(eq(agentTask.organizationId, input.organizationId), eq(agentTask.projectId, input.projectId)));

  const schedules = await db
    .select({ id: agentSchedule.id })
    .from(agentSchedule)
    .where(and(eq(agentSchedule.organizationId, input.organizationId), eq(agentSchedule.projectId, input.projectId)));

  if (tasks.length === 0 && schedules.length === 0) {
    await db
      .delete(agentProject)
      .where(and(eq(agentProject.id, input.projectId), eq(agentProject.organizationId, input.organizationId)));
    return { ok: true, mode: "deleted", keptTasks: 0 };
  }

  await db
    .update(agentProject)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(agentProject.id, input.projectId), eq(agentProject.organizationId, input.organizationId)));
  return { ok: true, mode: "archived", keptTasks: tasks.length };
}

/**
 * Puts an agent on a project.
 *
 * The agent must already belong to the same workspace. A caller cannot attach another
 * workspace's agent to their own project, which would otherwise be a way to route work to an
 * identity they do not control.
 */
export async function assignAgent(input: {
  organizationId: string;
  projectId: string;
  agentId: string;
}): Promise<{ ok: true; agents: ProjectAgentSummary[] } | { ok: false; error: string }> {
  const project = await getProject({ organizationId: input.organizationId, projectId: input.projectId });
  if (!project) return { ok: false, error: "not_found" };

  const [agent] = await db
    .select({ id: agentIdentity.id })
    .from(agentIdentity)
    .where(and(eq(agentIdentity.id, input.agentId), eq(agentIdentity.organizationId, input.organizationId)))
    .limit(1);
  if (!agent) return { ok: false, error: "agent_not_found" };

  await db
    .update(agentIdentity)
    .set({ projectId: input.projectId })
    .where(and(eq(agentIdentity.id, input.agentId), eq(agentIdentity.organizationId, input.organizationId)));

  return { ok: true, agents: await listProjectAgents(input.organizationId, input.projectId) };
}

export type ProjectAgentSummary = {
  id: string;
  slug: string;
  displayName: string;
  role: string;
  status: string;
  allowedTools: string[] | null;
};

export async function listProjectAgents(
  organizationId: string,
  projectId: string
): Promise<ProjectAgentSummary[]> {
  const rows = await db
    .select({
      id: agentIdentity.id,
      slug: agentIdentity.slug,
      displayName: agentIdentity.displayName,
      role: agentIdentity.role,
      status: agentIdentity.status,
      allowedTools: agentIdentity.allowedTools,
    })
    .from(agentIdentity)
    .where(and(eq(agentIdentity.organizationId, organizationId), eq(agentIdentity.projectId, projectId)))
    .orderBy(desc(agentIdentity.createdAt));
  return rows;
}

export async function listProjectTasks(input: {
  organizationId: string;
  projectId: string;
  limit?: number;
}) {
  return db
    .select({
      id: agentTask.id,
      title: agentTask.title,
      status: agentTask.status,
      ownerAgentId: agentTask.ownerAgentId,
      approvalRequired: agentTask.approvalRequired,
      payload: agentTask.payload,
      evidence: agentTask.evidence,
      createdAt: agentTask.createdAt,
      reportedAt: agentTask.reportedAt,
    })
    .from(agentTask)
    .where(and(eq(agentTask.organizationId, input.organizationId), eq(agentTask.projectId, input.projectId)))
    .orderBy(desc(agentTask.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 20, 1), 100));
}

export type ProjectExecutionRow = {
  id: string;
  taskId: string | null;
  status: string;
  tool: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  resultSummary: string | null;
  evidenceRef: string | null;
  error: string | null;
};

/** Execution evidence for a project, read through its tasks rather than copied to a second place. */
export async function listProjectExecutions(input: {
  organizationId: string;
  projectId: string;
  limit?: number;
}): Promise<ProjectExecutionRow[]> {
  const rows = await db
    .select({
      id: agentExecution.id,
      taskId: agentExecution.taskId,
      status: agentExecution.status,
      tool: agentExecution.tool,
      startedAt: agentExecution.startedAt,
      finishedAt: agentExecution.finishedAt,
      // The execution record keeps a summary and a pointer to the full evidence, not a copy.
      resultSummary: agentExecution.resultSummary,
      evidenceRef: agentExecution.evidenceRef,
      error: agentExecution.error,
    })
    .from(agentExecution)
    .innerJoin(agentTask, eq(agentTask.id, agentExecution.taskId))
    .where(and(eq(agentTask.organizationId, input.organizationId), eq(agentTask.projectId, input.projectId)))
    .orderBy(desc(agentExecution.startedAt))
    .limit(Math.min(Math.max(input.limit ?? 20, 1), 100));
  return rows as ProjectExecutionRow[];
}

export async function listProjectSchedules(organizationId: string, projectId: string) {
  return db
    .select({
      id: agentSchedule.id,
      title: agentSchedule.title,
      cronExpression: agentSchedule.cronExpression,
      timezone: agentSchedule.timezone,
      enabled: agentSchedule.enabled,
      nextRunAt: agentSchedule.nextRunAt,
    })
    .from(agentSchedule)
    .where(and(eq(agentSchedule.organizationId, organizationId), eq(agentSchedule.projectId, projectId)))
    .orderBy(desc(agentSchedule.createdAt));
}

/** Agents in this workspace that are not attached to any project yet. */
export async function listUnassignedAgents(organizationId: string): Promise<ProjectAgentSummary[]> {
  return db
    .select({
      id: agentIdentity.id,
      slug: agentIdentity.slug,
      displayName: agentIdentity.displayName,
      role: agentIdentity.role,
      status: agentIdentity.status,
      allowedTools: agentIdentity.allowedTools,
    })
    .from(agentIdentity)
    .where(and(eq(agentIdentity.organizationId, organizationId), isNull(agentIdentity.projectId)))
    .orderBy(desc(agentIdentity.createdAt));
}

/**
 * The agent that should take a given tool on a project.
 *
 * Only agents already assigned to the project, active, and explicitly allowed the tool are
 * eligible. If none qualifies the answer is null and the caller refuses, because inventing an
 * agent or widening its tools would defeat the assignment the customer made.
 */
export async function resolveProjectAgentForTool(input: {
  organizationId: string;
  projectId: string;
  tool: string;
}): Promise<ProjectAgentSummary | null> {
  const candidates = await db
    .select({
      id: agentIdentity.id,
      slug: agentIdentity.slug,
      displayName: agentIdentity.displayName,
      role: agentIdentity.role,
      status: agentIdentity.status,
      allowedTools: agentIdentity.allowedTools,
    })
    .from(agentIdentity)
    .where(
      and(
        eq(agentIdentity.organizationId, input.organizationId),
        eq(agentIdentity.projectId, input.projectId),
        eq(agentIdentity.status, "active")
      )
    )
    .orderBy(desc(agentIdentity.createdAt));

  for (const candidate of candidates) {
    if (Array.isArray(candidate.allowedTools) && candidate.allowedTools.includes(input.tool)) {
      return candidate;
    }
  }
  return null;
}

export async function countProjectTasks(organizationId: string, projectId: string): Promise<number> {
  const rows = await db
    .select({ id: agentTask.id })
    .from(agentTask)
    .where(
      and(
        eq(agentTask.organizationId, organizationId),
        eq(agentTask.projectId, projectId),
        ne(agentTask.status, "cancelled")
      )
    );
  return rows.length;
}
