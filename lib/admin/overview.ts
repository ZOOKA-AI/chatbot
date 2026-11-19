import "server-only";

import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import { adminDb } from "@/lib/db/queries";
import {
  agentApproval,
  agentDeployment,
  agentExecution,
  agentMessage,
  agentTask,
  browserSession,
  chat,
  mailMessage,
  mediaJob,
  message,
  organizationMember,
  usageEvent,
} from "@/lib/db/schema";
import { probe, probeRows } from "@/lib/admin/probe";
import type { AdminSection, AdminTable, Metric } from "@/lib/admin/types";

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * The overview, built from the database the app actually runs on.
 *
 * Every row here is a real count for this workspace. Nothing is estimated, and a read that fails says
 * so per metric instead of collapsing the page.
 */
export async function getCommandOverview(organizationId: string): Promise<AdminSection> {
  const db = adminDb();
  const today = startOfToday();

  const metrics = await Promise.all([
    probe("members", "أعضاء مساحة العمل", "Workspace members", "OrganizationMember", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(organizationMember)
        .where(eq(organizationMember.organizationId, organizationId));
      return row?.value ?? 0;
    }),
    probe("new_members_today", "أعضاء جدد اليوم", "New members today", "OrganizationMember.createdAt", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(organizationMember)
        .where(
          and(
            eq(organizationMember.organizationId, organizationId),
            gte(organizationMember.createdAt, today)
          )
        );
      return row?.value ?? 0;
    }),
    probe("chats", "المحادثات", "Chats", "Chat", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(chat)
        .where(eq(chat.organizationId, organizationId));
      return row?.value ?? 0;
    }),
    probe("messages", "الرسائل", "Messages", "Message_v2", async () => {
      const [row] = await db
        .select({ value: count(message.id) })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(eq(chat.organizationId, organizationId));
      return row?.value ?? 0;
    }),
    probe("agent_messages", "رسائل الوكيل", "Agent messages", "AgentMessage", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentMessage)
        .where(eq(agentMessage.organizationId, organizationId));
      return row?.value ?? 0;
    }),
    probe("agent_tasks", "مهام التطوير", "Development tasks", "AgentTask", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentTask)
        .where(eq(agentTask.organizationId, organizationId));
      return row?.value ?? 0;
    }),
    probe("agent_tasks_pending", "مهام مفتوحة", "Open tasks", "AgentTask.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentTask)
        .where(
          and(
            eq(agentTask.organizationId, organizationId),
            sql`${agentTask.status} in ('pending','running','claimed')`
          )
        );
      return row?.value ?? 0;
    }),
    probe("executions", "تنفيذات الوكيل", "Agent executions", "AgentExecution", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentExecution)
        .where(eq(agentExecution.organizationId, organizationId));
      return row?.value ?? 0;
    }),
    probe("executions_failed", "تنفيذات فاشلة", "Failed executions", "AgentExecution.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentExecution)
        .where(
          and(
            eq(agentExecution.organizationId, organizationId),
            eq(agentExecution.status, "failed")
          )
        );
      return row?.value ?? 0;
    }),
    probe("approvals_pending", "موافقات معلّقة", "Pending approvals", "AgentApproval.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentApproval)
        .where(eq(agentApproval.status, "pending"));
      return row?.value ?? 0;
    }),
    probe("media_jobs", "مهام الاستوديو", "Studio jobs", "MediaJob", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(mediaJob)
        .where(eq(mediaJob.organizationId, organizationId));
      return row?.value ?? 0;
    }),
    probe("media_jobs_failed", "مهام استوديو فاشلة", "Failed studio jobs", "MediaJob.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(mediaJob)
        .where(
          and(eq(mediaJob.organizationId, organizationId), eq(mediaJob.status, "failed"))
        );
      return row?.value ?? 0;
    }),
    probe("browser_sessions", "جلسات المتصفح", "Browser sessions", "BrowserSession", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(browserSession)
        .where(eq(browserSession.organizationId, organizationId));
      return row?.value ?? 0;
    }),
    probe("mail_messages", "رسائل البريد", "Mail messages", "MailMessage", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(mailMessage)
        .where(eq(mailMessage.organizationId, organizationId));
      return row?.value ?? 0;
    }),
    probe("usage_events", "أحداث الاستخدام", "Usage events", "UsageEvent", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(usageEvent)
        .where(eq(usageEvent.organizationId, organizationId));
      return row?.value ?? 0;
    }),
  ]);

  const tables = await Promise.all([
    probeRows(
      {
        key: "recent_executions",
        titleAr: "آخر تنفيذات الوكيل",
        titleEn: "Latest agent executions",
        columns: [
          { key: "tool", labelAr: "الأداة", labelEn: "Tool" },
          { key: "status", labelAr: "الحالة", labelEn: "Status" },
          { key: "duration", labelAr: "المدة (ثانية)", labelEn: "Duration (s)" },
          { key: "started", labelAr: "البداية", labelEn: "Started" },
        ],
      },
      async () => {
        const rows = await db
          .select({
            tool: agentExecution.tool,
            status: agentExecution.status,
            durationMs: agentExecution.durationMs,
            startedAt: agentExecution.startedAt,
          })
          .from(agentExecution)
          .where(eq(agentExecution.organizationId, organizationId))
          .orderBy(desc(agentExecution.startedAt))
          .limit(10);
        return rows.map((row) => ({
          tool: row.tool,
          status: row.status,
          duration:
            row.durationMs === null ? null : Math.round((row.durationMs / 1000) * 10) / 10,
          started: row.startedAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
        }));
      }
    ),
    probeRows(
      {
        key: "recent_activity",
        titleAr: "آخر أحداث الاستخدام",
        titleEn: "Latest usage events",
        columns: [
          { key: "event", labelAr: "الحدث", labelEn: "Event" },
          { key: "quantity", labelAr: "الكمية", labelEn: "Quantity" },
          { key: "time", labelAr: "الوقت", labelEn: "Time" },
        ],
      },
      async () => {
        const rows = await db
          .select({
            event: usageEvent.event,
            quantity: usageEvent.quantity,
            createdAt: usageEvent.createdAt,
          })
          .from(usageEvent)
          .where(eq(usageEvent.organizationId, organizationId))
          .orderBy(desc(usageEvent.createdAt))
          .limit(10);
        return rows.map((row) => ({
          event: row.event,
          quantity: row.quantity,
          time: row.createdAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
        }));
      }
    ),
  ]);

  return { metrics, tables };
}

export async function getIncidents(organizationId: string): Promise<AdminSection> {
  const db = adminDb();

  const metrics = await Promise.all([
    probe("incidents_open", "أعطال مفتوحة", "Open incidents", "AgentTask.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentTask)
        .where(
          and(
            eq(agentTask.organizationId, organizationId),
            sql`${agentTask.status} not in ('done','cancelled','reported')`
          )
        );
      return row?.value ?? 0;
    }),
    probe("incidents_done", "أعطال مغلقة", "Closed incidents", "AgentTask.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentTask)
        .where(
          and(
            eq(agentTask.organizationId, organizationId),
            sql`${agentTask.status} in ('done','cancelled','reported')`
          )
        );
      return row?.value ?? 0;
    }),
  ]);

  const tables = await Promise.all([
    probeRows(
      {
        key: "incident_rows",
        titleAr: "سجل الأعطال",
        titleEn: "Incident log",
        columns: [
          { key: "title", labelAr: "العنوان", labelEn: "Title" },
          { key: "status", labelAr: "الحالة", labelEn: "Status" },
          { key: "priority", labelAr: "الأولوية", labelEn: "Priority" },
          { key: "created", labelAr: "أُنشئ", labelEn: "Created" },
        ],
      },
      async () => {
        const rows = await db
          .select({
            title: agentTask.title,
            status: agentTask.status,
            priority: agentTask.priority,
            createdAt: agentTask.createdAt,
          })
          .from(agentTask)
          .where(eq(agentTask.organizationId, organizationId))
          .orderBy(desc(agentTask.createdAt))
          .limit(25);
        return rows.map((row) => ({
          title: row.title,
          status: row.status,
          priority: row.priority,
          created: row.createdAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
        }));
      }
    ),
  ]);

  return { metrics, tables };
}

export async function getDeployments(organizationId: string): Promise<AdminSection> {
  const db = adminDb();

  const metrics = await Promise.all([
    probe("deployments_total", "نشرات مسجّلة", "Recorded deployments", "AgentDeployment", async () => {
      const [row] = await db.select({ value: count() }).from(agentDeployment);
      return row?.value ?? 0;
    }),
    probe("deployments_production", "نشرات إنتاج", "Production deployments", "AgentDeployment.environment", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentDeployment)
        .where(eq(agentDeployment.environment, "production"));
      return row?.value ?? 0;
    }),
  ]);

  const tables = await Promise.all([
    probeRows(
      {
        key: "deployment_rows",
        titleAr: "سجل النشر",
        titleEn: "Deployment log",
        columns: [
          { key: "environment", labelAr: "البيئة", labelEn: "Environment" },
          { key: "sha", labelAr: "الالتزام", labelEn: "Commit" },
          { key: "status", labelAr: "الحالة", labelEn: "Status" },
          { key: "created", labelAr: "التاريخ", labelEn: "Date" },
        ],
      },
      async () => {
        const rows = await db
          .select({
            environment: agentDeployment.environment,
            commitSha: agentDeployment.commitSha,
            status: agentDeployment.status,
            createdAt: agentDeployment.createdAt,
          })
          .from(agentDeployment)
          .orderBy(desc(agentDeployment.createdAt))
          .limit(25);
        return rows.map((row) => ({
          environment: row.environment,
          sha: row.commitSha?.slice(0, 7) ?? null,
          status: row.status,
          created: row.createdAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
        }));
      }
    ),
  ]);

  void organizationId;
  return { metrics, tables };
}

export function metricValue(metrics: Metric[], key: string): number | null {
  return metrics.find((metric) => metric.key === key)?.value ?? null;
}

export function tableOf(tables: AdminTable[], key: string): AdminTable | null {
  return tables.find((table) => table.key === key) ?? null;
}
