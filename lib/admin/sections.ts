import "server-only";

import { and, count, desc, eq, ne, sql } from "drizzle-orm";

import { adminDb, getAdminUsers, getWorkspaceBilling } from "@/lib/db/queries";
import { getConnectorDetails } from "@/lib/integrations/connectors/detail";
import { buildN8nAdminOverview } from "@/lib/integrations/n8n/admin-overview";
import {
  agentApproval,
  agentDecision,
  agentExecution,
  agentIdentity,
  agentTask,
  browserSession,
  mediaJob,
  organization,
} from "@/lib/db/schema";
import { probe, probeRows } from "@/lib/admin/probe";
import type { AdminSection } from "@/lib/admin/types";

export async function getDevelopment(organizationId: string): Promise<AdminSection> {
  const db = adminDb();

  const metrics = await Promise.all([
    probe("tasks_open", "مهام قيد التنفيذ", "Tasks in flight", "AgentTask.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentTask)
        .where(
          and(
            eq(agentTask.organizationId, organizationId),
            sql`${agentTask.status} in ('pending','claimed','running')`
          )
        );
      return row?.value ?? 0;
    }),
    probe("approvals_waiting", "بانتظار موافقتك", "Awaiting your approval", "AgentApproval", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentApproval)
        .where(eq(agentApproval.status, "pending"));
      return row?.value ?? 0;
    }),
    probe("decisions", "قرارات مقترحة", "Proposed decisions", "AgentDecision", async () => {
      const [row] = await db.select({ value: count() }).from(agentDecision);
      return row?.value ?? 0;
    }),
  ]);

  const tables = await Promise.all([
    probeRows(
      {
        key: "task_rows",
        titleAr: "مهام التطوير",
        titleEn: "Development tasks",
        columns: [
          { key: "title", labelAr: "العنوان", labelEn: "Title" },
          { key: "status", labelAr: "الحالة", labelEn: "Status" },
          { key: "environment", labelAr: "البيئة", labelEn: "Environment" },
          { key: "created", labelAr: "أُنشئت", labelEn: "Created" },
        ],
      },
      async () => {
        const rows = await db
          .select({
            title: agentTask.title,
            status: agentTask.status,
            environment: agentTask.environment,
            createdAt: agentTask.createdAt,
          })
          .from(agentTask)
          .where(eq(agentTask.organizationId, organizationId))
          .orderBy(desc(agentTask.createdAt))
          .limit(20);
        return rows.map((row) => ({
          title: row.title,
          status: row.status,
          environment: row.environment,
          created: row.createdAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
        }));
      }
    ),
    probeRows(
      {
        key: "approval_rows",
        titleAr: "طلبات الموافقة",
        titleEn: "Approval requests",
        columns: [
          { key: "reason", labelAr: "السبب", labelEn: "Reason" },
          { key: "status", labelAr: "الحالة", labelEn: "Status" },
          { key: "created", labelAr: "التاريخ", labelEn: "Date" },
        ],
      },
      async () => {
        const rows = await db
          .select({
            reason: agentApproval.reason,
            status: agentApproval.status,
            createdAt: agentApproval.createdAt,
          })
          .from(agentApproval)
          .orderBy(desc(agentApproval.createdAt))
          .limit(20);
        return rows.map((row) => ({
          reason: row.reason.slice(0, 120),
          status: row.status,
          created: row.createdAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
        }));
      }
    ),
  ]);

  return { metrics, tables };
}

export async function getAgents(organizationId: string): Promise<AdminSection> {
  const db = adminDb();

  const metrics = await Promise.all([
    probe("agent_identities", "هويات الوكلاء", "Agent identities", "AgentIdentity", async () => {
      const [row] = await db.select({ value: count() }).from(agentIdentity);
      return row?.value ?? 0;
    }),
    probe("executions_running", "تنفيذات جارية", "Running executions", "AgentExecution.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(agentExecution)
        .where(
          and(
            eq(agentExecution.organizationId, organizationId),
            eq(agentExecution.status, "running")
          )
        );
      return row?.value ?? 0;
    }),
  ]);

  const tables = await Promise.all([
    probeRows(
      {
        key: "identity_rows",
        titleAr: "الوكلاء المسجّلون",
        titleEn: "Registered agents",
        columns: [
          { key: "slug", labelAr: "المعرّف", labelEn: "Slug" },
          { key: "role", labelAr: "الدور", labelEn: "Role" },
          { key: "status", labelAr: "الحالة", labelEn: "Status" },
          { key: "environment", labelAr: "البيئة", labelEn: "Environment" },
        ],
      },
      async () => {
        const rows = await db
          .select({
            slug: agentIdentity.slug,
            role: agentIdentity.role,
            status: agentIdentity.status,
            environment: agentIdentity.environment,
          })
          .from(agentIdentity)
          .limit(25);
        return rows.map((row) => ({
          slug: row.slug,
          role: row.role,
          status: row.status,
          environment: row.environment,
        }));
      }
    ),
  ]);

  return { metrics, tables };
}

export async function getUsers(organizationId: string): Promise<AdminSection> {
  const { users } = await getAdminUsers({ organizationId, limit: 50, offset: 0 });

  return {
    metrics: [
      {
        key: "users_listed",
        labelAr: "مستخدمون معروضون",
        labelEn: "Users listed",
        value: users.length,
        state: users.length > 0 ? "ok" : "empty",
        source: "OrganizationMember ⋈ User",
      },
    ],
    tables: [
      {
        key: "user_rows",
        titleAr: "أعضاء مساحة العمل",
        titleEn: "Workspace members",
        columns: [
          { key: "email", labelAr: "البريد", labelEn: "Email" },
          { key: "role", labelAr: "الدور", labelEn: "Role" },
          { key: "joined", labelAr: "الانضمام", labelEn: "Joined" },
        ],
        rows: users.map((row) => ({
          email: row.email,
          role: row.role,
          joined: row.joinedAt?.toISOString().slice(0, 10) ?? null,
        })),
        state: users.length > 0 ? "ok" : "empty",
      },
    ],
  };
}

export async function getWorkspaces(organizationId: string): Promise<AdminSection> {
  const db = adminDb();

  const metrics = await Promise.all([
    probe("workspaces", "مساحات عمل مرئية", "Visible workspaces", "Organization", async () => {
      const [row] = await db.select({ value: count() }).from(organization);
      return row?.value ?? 0;
    }),
  ]);

  const tables = await Promise.all([
    probeRows(
      {
        key: "workspace_rows",
        titleAr: "مساحات العمل",
        titleEn: "Workspaces",
        columns: [
          { key: "name", labelAr: "الاسم", labelEn: "Name" },
          { key: "current", labelAr: "الحالية", labelEn: "Current" },
          { key: "created", labelAr: "أُنشئت", labelEn: "Created" },
        ],
      },
      async () => {
        const columns = {
          id: organization.id,
          name: organization.name,
          createdAt: organization.createdAt,
        };
        // The current workspace is fetched first, on its own. A plain LIMIT 25 over
        // 281 organizations returns an arbitrary page that usually does not contain
        // the caller's own workspace, so the "current" column read as empty for every
        // row and the marker promised by the page description never appeared.
        const [current] = await db
          .select(columns)
          .from(organization)
          .where(eq(organization.id, organizationId))
          .limit(1);
        const others = await db
          .select(columns)
          .from(organization)
          .where(ne(organization.id, organizationId))
          .orderBy(desc(organization.createdAt))
          .limit(24);
        return [...(current ? [current] : []), ...others].map((row) => ({
          name: row.name,
          current: row.id === organizationId ? "✓" : null,
          created: row.createdAt?.toISOString().slice(0, 10) ?? null,
        }));
      }
    ),
  ]);

  return { metrics, tables };
}

export async function getIntegrations(organizationId: string): Promise<AdminSection> {
  let details: Awaited<ReturnType<typeof getConnectorDetails>>;
  try {
    details = await getConnectorDetails(organizationId);
  } catch {
    details = new Map();
  }

  const rows = [...details.values()].map((detail) => ({
    provider: detail.providerId,
    account: detail.accountEmail ?? detail.account ?? null,
    status: detail.status,
    scopes: detail.scopes.length,
    error: detail.lastError ? detail.lastError.slice(0, 80) : null,
  }));

  const connected = rows.filter((row) => row.status === "connected").length;
  const errored = rows.filter((row) => row.status === "error").length;

  return {
    metrics: [
      {
        key: "integrations_total",
        labelAr: "تكاملات لها سجل",
        labelEn: "Integrations with a record",
        value: rows.length,
        state: rows.length > 0 ? "ok" : "empty",
        source: "listWorkspaceIntegrations",
      },
      {
        key: "integrations_connected",
        labelAr: "متصلة",
        labelEn: "Connected",
        value: connected,
        state: connected > 0 ? "ok" : "empty",
        source: "status = connected",
      },
      {
        key: "integrations_error",
        labelAr: "بها خطأ",
        labelEn: "With an error",
        value: errored,
        state: errored > 0 ? "ok" : "empty",
        source: "status = error",
      },
    ],
    tables: [
      {
        key: "integration_rows",
        titleAr: "التكاملات",
        titleEn: "Integrations",
        columns: [
          { key: "provider", labelAr: "المزوّد", labelEn: "Provider" },
          { key: "account", labelAr: "الحساب", labelEn: "Account" },
          { key: "status", labelAr: "الحالة", labelEn: "Status" },
          { key: "scopes", labelAr: "الصلاحيات", labelEn: "Scopes" },
          { key: "error", labelAr: "آخر خطأ", labelEn: "Last error" },
        ],
        rows,
        state: rows.length > 0 ? "ok" : "empty",
      },
    ],
  };
}

export async function getStudios(organizationId: string): Promise<AdminSection> {
  const db = adminDb();

  const metrics = await Promise.all([
    probe("studio_succeeded", "مهام ناجحة", "Succeeded jobs", "MediaJob.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(mediaJob)
        .where(
          and(eq(mediaJob.organizationId, organizationId), eq(mediaJob.status, "succeeded"))
        );
      return row?.value ?? 0;
    }),
    probe("studio_running", "قيد التنفيذ", "Running jobs", "MediaJob.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(mediaJob)
        .where(and(eq(mediaJob.organizationId, organizationId), eq(mediaJob.status, "running")));
      return row?.value ?? 0;
    }),
  ]);

  const tables = await Promise.all([
    probeRows(
      {
        key: "studio_rows",
        titleAr: "مهام الاستوديو",
        titleEn: "Studio jobs",
        columns: [
          { key: "type", labelAr: "النوع", labelEn: "Type" },
          { key: "status", labelAr: "الحالة", labelEn: "Status" },
          { key: "created", labelAr: "التاريخ", labelEn: "Date" },
          { key: "error", labelAr: "الخطأ", labelEn: "Error" },
        ],
      },
      async () => {
        const rows = await db
          .select({
            actionType: mediaJob.actionType,
            status: mediaJob.status,
            createdAt: mediaJob.createdAt,
            error: mediaJob.error,
          })
          .from(mediaJob)
          .where(eq(mediaJob.organizationId, organizationId))
          .orderBy(desc(mediaJob.createdAt))
          .limit(20);
        return rows.map((row) => ({
          type: row.actionType,
          status: row.status,
          created: row.createdAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
          error: row.error ? row.error.slice(0, 80) : null,
        }));
      }
    ),
  ]);

  return { metrics, tables };
}

export async function getBrowserSessions(organizationId: string): Promise<AdminSection> {
  const db = adminDb();

  const metrics = await Promise.all([
    probe("browser_live", "جلسات حيّة", "Live sessions", "BrowserSession.status", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(browserSession)
        .where(
          and(eq(browserSession.organizationId, organizationId), eq(browserSession.status, "ready"))
        );
      return row?.value ?? 0;
    }),
    probe("browser_errors", "جلسات بأخطاء", "Sessions with errors", "BrowserSession.lastError", async () => {
      const [row] = await db
        .select({ value: count() })
        .from(browserSession)
        .where(
          and(
            eq(browserSession.organizationId, organizationId),
            sql`${browserSession.lastError} is not null`
          )
        );
      return row?.value ?? 0;
    }),
  ]);

  const tables = await Promise.all([
    probeRows(
      {
        key: "browser_rows",
        titleAr: "الجلسات",
        titleEn: "Sessions",
        columns: [
          { key: "status", labelAr: "الحالة", labelEn: "Status" },
          { key: "url", labelAr: "الصفحة", labelEn: "Page" },
          { key: "created", labelAr: "أُنشئت", labelEn: "Created" },
          { key: "error", labelAr: "آخر خطأ", labelEn: "Last error" },
        ],
      },
      async () => {
        const rows = await db
          .select({
            status: browserSession.status,
            currentUrl: browserSession.currentUrl,
            createdAt: browserSession.createdAt,
            lastError: browserSession.lastError,
          })
          .from(browserSession)
          .where(eq(browserSession.organizationId, organizationId))
          .orderBy(desc(browserSession.createdAt))
          .limit(20);
        return rows.map((row) => ({
          status: row.status,
          url: row.currentUrl ? row.currentUrl.slice(0, 60) : null,
          created: row.createdAt?.toISOString().slice(0, 16).replace("T", " ") ?? null,
          error: row.lastError ? row.lastError.slice(0, 60) : null,
        }));
      }
    ),
  ]);

  return { metrics, tables };
}

export type AutomationSnapshot = {
  stage: string;
  workflowCount: number;
  activeWorkflowCount: number;
  reasons: string[];
  probeError: string | null;
  baseUrl: string | null;
};

export async function getAutomation(organizationId: string): Promise<AutomationSnapshot> {
  try {
    const overview = await buildN8nAdminOverview(organizationId);
    return {
      stage: overview.stage,
      workflowCount: overview.workflowCount,
      activeWorkflowCount: overview.activeWorkflowCount,
      reasons: overview.reasons,
      probeError: overview.probeError,
      baseUrl: overview.baseUrl,
    };
  } catch (error) {
    return {
      stage: "error",
      workflowCount: 0,
      activeWorkflowCount: 0,
      reasons: [],
      probeError: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      baseUrl: null,
    };
  }
}

export type BillingSnapshot = {
  plan: string;
  status: string;
  periodEnd: string | null;
  messages: number;
  agentRuns: number;
};

export async function getBilling(organizationId: string): Promise<BillingSnapshot> {
  const billing = await getWorkspaceBilling(organizationId);
  return {
    plan: billing.subscription?.plan ?? "free",
    status: billing.subscription?.status ?? "none",
    periodEnd: billing.subscription?.periodEnd
      ? billing.subscription.periodEnd.toISOString().slice(0, 10)
      : null,
    messages: billing.usage.messages,
    agentRuns: billing.usage.agentRuns,
  };
}
