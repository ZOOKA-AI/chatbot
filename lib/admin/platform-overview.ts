import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { probe, probeRows } from "@/lib/admin/probe";
import type { AdminSection, AdminTable, Metric } from "@/lib/admin/types";
import type { PlatformRoleName } from "@/lib/auth/platform-role-policy";
import { adminDb } from "@/lib/db/queries";

/**
 * Platform-wide numbers for platform administrators, across every workspace.
 *
 * Aggregates only: counts, never message text or anyone's records. Read on the
 * admin connection (adminDb: the service connection when tenant isolation is
 * on, the primary one when it is off), because a tenant-scoped handle can only
 * ever see one workspace and would quietly turn "all users" into "my users".
 *
 * A metric whose read fails is shown as unavailable with its reason, never as 0.
 */

async function scalar(query: SQL): Promise<number> {
  const rows = (await adminDb().execute(query)) as unknown as Array<{ value: number | string | null }>;
  const value = rows[0]?.value;
  return value === null || value === undefined ? 0 : Number(value);
}

export async function getPlatformOverview(role: PlatformRoleName): Promise<AdminSection> {
  const metrics: Metric[] = await Promise.all([
    probe("platform_users", "إجمالي المستخدمين", "Total users", "User (all rows)", () =>
      scalar(sql`select count(*)::int as value from "User"`)
    ),
    probe(
      "platform_new_users_7d",
      "مستخدمون جدد (7 أيام)",
      "New users (7 days)",
      "User whose first OrganizationMember row is within 7 days (User has no createdAt)",
      () =>
        scalar(sql`select count(*)::int as value from (
          select "userId" from "OrganizationMember" group by "userId"
          having min("createdAt") > now() - interval '7 days') first_join`)
    ),
    probe(
      "platform_active_users_7d",
      "مستخدمون نشطون (7 أيام)",
      "Active users (7 days)",
      "distinct UsageEvent.userId, last 7 days",
      () =>
        scalar(
          sql`select count(distinct "userId")::int as value from "UsageEvent" where "createdAt" > now() - interval '7 days'`
        )
    ),
    probe("platform_workspaces", "مساحات العمل", "Workspaces", "Organization (all rows)", () =>
      scalar(sql`select count(*)::int as value from "Organization"`)
    ),
    probe("platform_chats", "المحادثات", "Conversations", "Chat (all workspaces)", () =>
      scalar(sql`select count(*)::int as value from "Chat"`)
    ),
    probe(
      "platform_messages_24h",
      "رسائل آخر 24 ساعة",
      "Messages (24 h)",
      "Message_v2.createdAt, last 24 hours",
      () =>
        scalar(
          sql`select count(*)::int as value from "Message_v2" where "createdAt" > now() - interval '24 hours'`
        )
    ),
    probe("platform_agent_executions", "تنفيذات الوكيل", "Agent executions", "AgentExecution (all)", () =>
      scalar(sql`select count(*)::int as value from "AgentExecution"`)
    ),
    probe(
      "platform_agent_failed",
      "تنفيذات فاشلة",
      "Failed agent executions",
      "AgentExecution.status = failed",
      () => scalar(sql`select count(*)::int as value from "AgentExecution" where "status" = 'failed'`)
    ),
    probe("platform_media_jobs", "مهام الاستوديو", "Studio jobs", "MediaJob (all)", () =>
      scalar(sql`select count(*)::int as value from "MediaJob"`)
    ),
    probe(
      "platform_media_failed",
      "مهام استوديو فاشلة",
      "Failed studio jobs",
      "MediaJob.status = failed",
      () => scalar(sql`select count(*)::int as value from "MediaJob" where "status" = 'failed'`)
    ),
  ]);

  const tables: AdminTable[] = [
    await probeRows(
      {
        key: "platform_usage_24h",
        titleAr: "أحداث الاستخدام آخر 24 ساعة (كل المنصة)",
        titleEn: "Usage events, last 24 h (whole platform)",
        columns: [
          { key: "event", labelAr: "الحدث", labelEn: "Event" },
          { key: "count", labelAr: "العدد", labelEn: "Count" },
        ],
      },
      async () => {
        const rows = (await adminDb().execute(
          sql`select "event", count(*)::int as count from "UsageEvent"
              where "createdAt" > now() - interval '24 hours' group by "event" order by count desc`
        )) as unknown as Array<{ event: string; count: number }>;
        return rows.map((row) => ({ event: row.event, count: Number(row.count) }));
      }
    ),
  ];

  if (role === "super_admin") {
    tables.push(
      await probeRows(
        {
          key: "platform_roles",
          titleAr: "صلاحيات المنصة",
          titleEn: "Platform role grants",
          columns: [
            { key: "user", labelAr: "المستخدم", labelEn: "User" },
            { key: "role", labelAr: "الدور", labelEn: "Role" },
            { key: "grantedBy", labelAr: "منحها", labelEn: "Granted by" },
            { key: "grantedAt", labelAr: "التاريخ", labelEn: "Granted" },
          ],
        },
        async () => {
          const rows = (await adminDb().execute(
            sql`select u."email" as user, r."role", r."grantedBy", to_char(r."grantedAt", 'YYYY-MM-DD HH24:MI') as "grantedAt"
                from "PlatformRole" r join "User" u on u."id" = r."userId" order by r."grantedAt"`
          )) as unknown as Array<Record<string, string>>;
          return rows;
        }
      ),
      await probeRows(
        {
          key: "platform_audit",
          titleAr: "سجل تدقيق الإدارة (آخر 20)",
          titleEn: "Admin audit trail (latest 20)",
          columns: [
            { key: "at", labelAr: "الوقت", labelEn: "Time" },
            { key: "action", labelAr: "الإجراء", labelEn: "Action" },
            { key: "outcome", labelAr: "النتيجة", labelEn: "Outcome" },
            { key: "actor", labelAr: "المنفّذ", labelEn: "Actor" },
          ],
        },
        async () => {
          const rows = (await adminDb().execute(
            sql`select to_char(a."createdAt", 'YYYY-MM-DD HH24:MI:SS') as at, a."action", a."outcome",
                       coalesce(u."email", '—') as actor
                from "PlatformAuditLog" a left join "User" u on u."id" = a."actorUserId"
                order by a."createdAt" desc limit 20`
          )) as unknown as Array<Record<string, string>>;
          return rows;
        }
      )
    );
  }

  return { metrics, tables };
}
