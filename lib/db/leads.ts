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

export const LEAD_STATUSES = [
  "new",
  "qualified",
  "booked",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Creates a lead, or refreshes it when the same external key already exists.
 * Syncing the same WhatsApp customer twice must not create a second row, and a
 * newer note from the bot should replace the older one.
 */
export async function upsertLead(input: {
  organizationId: string;
  externalKey: string;
  name: string | null;
  phone: string | null;
  service: string | null;
  city: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  lastContactAt: string | null;
}): Promise<"inserted" | "updated"> {
  const rows = await db.execute<{ inserted: boolean }>(sql`
    insert into lead (organization_id, external_key, name, phone, service,
                      city, source, status, notes, last_contact_at)
    values (${input.organizationId}, ${input.externalKey}, ${input.name},
            ${input.phone}, ${input.service}, ${input.city}, ${input.source},
            ${input.status}, ${input.notes}, ${input.lastContactAt})
    on conflict (organization_id, external_key) do update set
      name = coalesce(excluded.name, lead.name),
      phone = coalesce(excluded.phone, lead.phone),
      service = coalesce(excluded.service, lead.service),
      city = coalesce(excluded.city, lead.city),
      source = coalesce(excluded.source, lead.source),
      notes = coalesce(excluded.notes, lead.notes),
      last_contact_at = greatest(
        coalesce(excluded.last_contact_at, lead.last_contact_at),
        coalesce(lead.last_contact_at, excluded.last_contact_at)
      )
    returning (xmax = 0) as inserted
  `);
  const first = (rows as unknown as { inserted: boolean }[])[0];
  return first?.inserted ? "inserted" : "updated";
}

/** Status changes are owner/admin actions and always scoped to the workspace. */
export async function updateLeadStatus(
  organizationId: string,
  leadId: string,
  status: LeadStatus
) {
  const rows = await db.execute<{ id: string }>(sql`
    update lead set status = ${status}
    where id = ${leadId} and organization_id = ${organizationId}
    returning id
  `);
  return (rows as unknown as { id: string }[]).length > 0;
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
