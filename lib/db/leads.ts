import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";

export type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  service: string | null;
  city: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  lastContactAt: string | null;
};

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  service: string | null;
  city: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  last_contact_at: string | null;
};

/**
 * Leads live in their own table rather than the chat tables: they arrive from
 * WhatsApp, the website form and the owner's own contacts, and most of them
 * never open a Zooka chat at all.
 */
export async function listLeads(
  organizationId: string,
  limit = 100
): Promise<Lead[]> {
  const rows = await db.execute<LeadRow>(sql`
    select id, name, phone, service, city, source, status, notes,
           last_contact_at
    from lead
    where organization_id = ${organizationId}
    order by coalesce(last_contact_at, created_at) desc
    limit ${limit}
  `);
  return (rows as unknown as LeadRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    service: row.service,
    city: row.city,
    source: row.source,
    status: row.status,
    notes: row.notes,
    lastContactAt: row.last_contact_at,
  }));
}

export async function countLeadsByStatus(organizationId: string) {
  const rows = await db.execute<{ status: string; total: string }>(sql`
    select status, count(*)::text as total
    from lead
    where organization_id = ${organizationId}
    group by status
  `);
  const counts: Record<string, number> = {};
  for (const row of rows as unknown as { status: string; total: string }[]) {
    counts[row.status] = Number(row.total);
  }
  return counts;
}
