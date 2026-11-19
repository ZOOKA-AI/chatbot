import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertLead } from "@/lib/db/leads";
import { isLeadStatus } from "@/lib/leads/status";
import { isLeadsIngestKeyValid } from "@/lib/integrations/leads/ingest-key";

/**
 * Push endpoint for the WhatsApp bot, the booking form and n8n. It is the only
 * way leads reach the table automatically; it is guarded by a derived key and
 * never reads anything back.
 */
const leadSchema = z.object({
  externalKey: z.string().trim().min(3).max(200),
  name: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(40).nullish(),
  service: z.string().trim().max(300).nullish(),
  city: z.string().trim().max(120).nullish(),
  source: z.string().trim().max(60).nullish(),
  status: z.string().trim().optional(),
  notes: z.string().trim().max(2000).nullish(),
  lastContactAt: z.string().datetime().nullish(),
});

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  leads: z.array(leadSchema).min(1).max(200),
});

export async function POST(request: Request) {
  if (!isLeadsIngestKeyValid(request.headers.get("x-leads-key"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const { organizationId, leads } = parsed.data;
  let inserted = 0;
  let updated = 0;
  const failed: string[] = [];

  for (const lead of leads) {
    const status = lead.status && isLeadStatus(lead.status) ? lead.status : "new";
    try {
      const result = await upsertLead({
        organizationId,
        externalKey: lead.externalKey,
        name: lead.name ?? null,
        phone: lead.phone ?? null,
        service: lead.service ?? null,
        city: lead.city ?? null,
        source: lead.source ?? null,
        status,
        notes: lead.notes ?? null,
        lastContactAt: lead.lastContactAt ?? null,
      });
      if (result === "inserted") {
        inserted += 1;
      } else {
        updated += 1;
      }
    } catch {
      failed.push(lead.externalKey);
    }
  }

  return NextResponse.json({ ok: failed.length === 0, inserted, updated, failed });
}
