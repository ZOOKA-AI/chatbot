import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  DEFAULT_AGENT_PERMISSIONS,
  isKnownTool,
} from "@/lib/agents/agent-tools";
import {
  AGENT_SCOPES,
  registerAgent,
  updateAgentConfig,
} from "@/lib/agents/command-center";
import { nextRunAfter } from "@/lib/agents/cron";
import { adminDb, db } from "@/lib/db/queries";
import {
  agentIdentity,
  agentSchedule,
  agentTemplateLink,
} from "@/lib/db/schema";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const allowedScope = (value: string) =>
  (AGENT_SCOPES as readonly string[]).includes(value);

const scheduleSchema = z
  .object({
    title: z.string().min(1).max(200),
    instruction: z.string().max(4000),
    tool: z.string().min(1).max(64).refine(isKnownTool),
    cronExpression: z.string().min(1).max(64),
    timezone: z.string().min(1).max(64),
    enabled: z.boolean(),
    missedRunPolicy: z.enum(["skip", "run_once"]),
  })
  .strict();

const templateSchema = z
  .object({
    version: z.literal(1),
    agent: z
      .object({
        displayName: z.string().min(2).max(120),
        role: z.string().min(2).max(64),
        instructions: z.string().max(4000).nullable(),
        scopes: z
          .array(z.string().refine(allowedScope))
          .max(AGENT_SCOPES.length),
        allowedTools: z.array(z.string().refine(isKnownTool)).max(64),
      })
      .strict(),
    schedules: z.array(scheduleSchema).max(100),
  })
  .strict();

export type AgentTemplatePayload = z.infer<typeof templateSchema>;

/**
 * Builds the only data a public template is allowed to contain.
 * The explicit field selection intentionally excludes keys, model credentials,
 * project links, schedule history, connections, and workspace data.
 */
export function serializeAgentTemplate(
  agent: Record<string, unknown>,
  schedules: Record<string, unknown>[]
): AgentTemplatePayload {
  const allowedTools = Array.isArray(agent.allowedTools)
    ? [
        ...new Set(
          agent.allowedTools.filter(
            (tool): tool is string =>
              typeof tool === "string" && isKnownTool(tool)
          )
        ),
      ]
    : [];
  const scopes = Array.isArray(agent.scopes)
    ? [
        ...new Set(
          agent.scopes.filter(
            (scope): scope is string =>
              typeof scope === "string" && allowedScope(scope)
          )
        ),
      ]
    : [];
  const payload = {
    version: 1 as const,
    agent: {
      displayName:
        typeof agent.displayName === "string"
          ? agent.displayName.slice(0, 120)
          : "Agent",
      role: typeof agent.role === "string" ? agent.role.slice(0, 64) : "worker",
      instructions:
        typeof agent.instructions === "string"
          ? agent.instructions.slice(0, 4000)
          : null,
      scopes,
      allowedTools,
    },
    schedules: schedules
      .filter(
        (schedule) =>
          typeof schedule.tool === "string" &&
          isKnownTool(schedule.tool) &&
          typeof schedule.title === "string" &&
          typeof schedule.instruction === "string" &&
          typeof schedule.cronExpression === "string" &&
          typeof schedule.timezone === "string" &&
          typeof schedule.enabled === "boolean" &&
          (schedule.missedRunPolicy === "skip" ||
            schedule.missedRunPolicy === "run_once")
      )
      .slice(0, 100)
      .map((schedule) => ({
        title: (schedule.title as string).slice(0, 200),
        instruction: (schedule.instruction as string).slice(0, 4000),
        tool: schedule.tool as string,
        cronExpression: (schedule.cronExpression as string).slice(0, 64),
        timezone: (schedule.timezone as string).slice(0, 64),
        enabled: schedule.enabled as boolean,
        missedRunPolicy: schedule.missedRunPolicy as "skip" | "run_once",
      })),
  };
  return templateSchema.parse(payload);
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isUndefinedTableError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    if ("code" in current && current.code === "42P01") {
      return true;
    }
    seen.add(current);
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

export async function createAgentTemplateLink(input: {
  organizationId: string;
  agentId: string;
}) {
  const [agent] = await db
    .select({
      displayName: agentIdentity.displayName,
      role: agentIdentity.role,
      instructions: agentIdentity.instructions,
      scopes: agentIdentity.scopes,
      allowedTools: agentIdentity.allowedTools,
    })
    .from(agentIdentity)
    .where(
      and(
        eq(agentIdentity.id, input.agentId),
        eq(agentIdentity.organizationId, input.organizationId)
      )
    )
    .limit(1);
  if (!agent) {
    return null;
  }

  const schedules = await db
    .select({
      title: agentSchedule.title,
      instruction: agentSchedule.instruction,
      tool: agentSchedule.tool,
      cronExpression: agentSchedule.cronExpression,
      timezone: agentSchedule.timezone,
      enabled: agentSchedule.enabled,
      missedRunPolicy: agentSchedule.missedRunPolicy,
    })
    .from(agentSchedule)
    .where(
      and(
        eq(agentSchedule.organizationId, input.organizationId),
        eq(agentSchedule.agentId, input.agentId)
      )
    );
  const payload = serializeAgentTemplate(agent, schedules);
  const token = randomBytes(32).toString("base64url");

  await db
    .insert(agentTemplateLink)
    .values({
      agentId: input.agentId,
      organizationId: input.organizationId,
      tokenHash: hashToken(token),
      payload,
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: agentTemplateLink.agentId,
      set: {
        organizationId: input.organizationId,
        tokenHash: hashToken(token),
        payload,
        createdAt: new Date(),
        revokedAt: null,
      },
    });

  return { token, payload };
}

export async function revokeAgentTemplateLink(input: {
  organizationId: string;
  agentId: string;
}) {
  const rows = await db
    .update(agentTemplateLink)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(agentTemplateLink.agentId, input.agentId),
        eq(agentTemplateLink.organizationId, input.organizationId)
      )
    )
    .returning({ agentId: agentTemplateLink.agentId });
  return rows.length > 0;
}

export async function getPublicAgentTemplate(
  token: string
): Promise<AgentTemplatePayload | null> {
  if (!tokenPattern.test(token)) {
    return null;
  }
  try {
    const [row] = await adminDb()
      .select({ payload: agentTemplateLink.payload })
      .from(agentTemplateLink)
      .where(
        and(
          eq(agentTemplateLink.tokenHash, hashToken(token)),
          isNull(agentTemplateLink.revokedAt)
        )
      )
      .limit(1);
    if (!row) {
      return null;
    }
    const parsed = templateSchema.safeParse(row.payload);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function copyAgentTemplate(token: string, organizationId: string) {
  const template = await getPublicAgentTemplate(token);
  if (!template) {
    return null;
  }

  const suffix = randomBytes(4).toString("hex");
  const baseSlug =
    template.agent.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 45) || "agent";
  const created = await registerAgent({
    organizationId,
    slug: `${baseSlug}-template-${suffix}`,
    displayName: template.agent.displayName,
    role: template.agent.role,
    scopes:
      template.agent.scopes.length > 0 ? template.agent.scopes : ["task:read"],
  });
  const agent = await updateAgentConfig({
    organizationId,
    agentId: created.agent.id,
    patch: {
      scopes: template.agent.scopes,
      allowedTools: template.agent.allowedTools,
      instructions: template.agent.instructions,
      updateWithoutApproval:
        DEFAULT_AGENT_PERMISSIONS.updateWithoutApproval,
      deleteWithoutApproval: DEFAULT_AGENT_PERMISSIONS.deleteWithoutApproval,
      sendMessagesWithoutApproval:
        DEFAULT_AGENT_PERMISSIONS.sendMessagesWithoutApproval,
    },
  });
  if (!agent) {
    throw new Error("template_agent_creation_failed");
  }

  let schedulesCreated = 0;
  for (const schedule of template.schedules) {
    const nextRunAt = schedule.enabled
      ? nextRunAfter(schedule.cronExpression, new Date(), schedule.timezone)
      : null;
    await db.insert(agentSchedule).values({
      organizationId,
      agentId: created.agent.id,
      title: schedule.title,
      instruction: schedule.instruction,
      tool: schedule.tool,
      cronExpression: schedule.cronExpression,
      timezone: schedule.timezone,
      enabled: schedule.enabled && nextRunAt !== null,
      missedRunPolicy: schedule.missedRunPolicy,
      nextRunAt,
      createdBy: "template",
    });
    schedulesCreated += 1;
  }

  return {
    agent: { id: agent.id, displayName: agent.displayName },
    schedulesCreated,
  };
}
