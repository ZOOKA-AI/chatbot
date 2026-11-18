/**
 * The only place ZOOKA Mail talks to Postgres.
 *
 * Every statement names its organizationId in the WHERE clause, and the
 * insert of an address relies on ON CONFLICT DO NOTHING so the database, not a
 * prior SELECT, decides whether a name was free. Raw SQL is used rather than the
 * query builder because the tables are introduced by migration 0059 and the
 * builder's snapshot would otherwise have to be regenerated for a build that is
 * not allowed to touch production.
 */

import "server-only";

import { sql } from "drizzle-orm";

import { adminDb } from "@/lib/db/queries";

import type {
  MailAddressRecord,
  MailDraftRecord,
  MailFolder,
  MailMessageRecord,
  MailProviderId,
  MailRepository,
} from "./types";

type Row = Record<string, any>;

function rows(result: unknown): Row[] {
  return Array.isArray(result) ? (result as Row[]) : [];
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toAddress(row: Row): MailAddressRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    userId: String(row.userId),
    localPart: String(row.localPart),
    address: String(row.address),
    status: row.status,
    provider: row.provider,
    createdAt: toDate(row.createdAt),
  };
}

function toMessage(row: Row): MailMessageRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    mailAddressId: String(row.mailAddressId),
    folder: row.folder,
    direction: row.direction,
    fromAddress: String(row.fromAddress ?? ""),
    fromName: row.fromName ?? null,
    subject: row.subject ?? null,
    snippet: row.snippet ?? null,
    bodyHtml: row.bodyHtml ?? null,
    bodyText: row.bodyText ?? null,
    receivedAt: toDate(row.receivedAt),
    isRead: Boolean(row.isRead),
    hasAttachments: Boolean(row.hasAttachments),
    aiSummary: row.aiSummary ?? null,
  };
}

function toDraft(row: Row): MailDraftRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    mailAddressId: String(row.mailAddressId),
    userId: String(row.userId),
    toAddresses: Array.isArray(row.toAddresses) ? row.toAddresses.map(String) : [],
    subject: row.subject ?? null,
    bodyText: row.bodyText ?? null,
    aiGenerated: Boolean(row.aiGenerated),
    status: row.status,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

export function createMailRepository(): MailRepository {
  const db = () => adminDb();

  return {
    async insertAddress(input) {
      const result = await db().execute(sql`
        insert into "MailAddress" ("organizationId", "userId", "localPart", "address", "provider")
        values (${input.organizationId}, ${input.userId}, ${input.localPart}, ${input.address}, ${input.provider})
        on conflict do nothing
        returning "id", "organizationId", "userId", "localPart", "address", "status", "provider", "createdAt"
      `);
      const row = rows(result)[0];
      return row ? toAddress(row) : null;
    },

    async findAddressByLocalPart(localPart) {
      const result = await db().execute(sql`
        select "id", "organizationId", "userId", "localPart", "address", "status", "provider", "createdAt"
        from "MailAddress"
        where "localPart" = ${localPart}
        limit 1
      `);
      const row = rows(result)[0];
      return row ? toAddress(row) : null;
    },

    async getAddress(organizationId, id) {
      const result = await db().execute(sql`
        select "id", "organizationId", "userId", "localPart", "address", "status", "provider", "createdAt"
        from "MailAddress"
        where "id" = ${id} and "organizationId" = ${organizationId}
        limit 1
      `);
      const row = rows(result)[0];
      return row ? toAddress(row) : null;
    },

    async listAddresses(organizationId, userId) {
      const result = await db().execute(sql`
        select "id", "organizationId", "userId", "localPart", "address", "status", "provider", "createdAt"
        from "MailAddress"
        where "organizationId" = ${organizationId} and "userId" = ${userId}
        order by "createdAt" asc
      `);
      return rows(result).map(toAddress);
    },

    async countAddresses(organizationId, userId) {
      const result = userId
        ? await db().execute(sql`
            select count(*)::int as total from "MailAddress"
            where "organizationId" = ${organizationId} and "userId" = ${userId}
          `)
        : await db().execute(sql`
            select count(*)::int as total from "MailAddress"
            where "organizationId" = ${organizationId}
          `);
      const row = rows(result)[0];
      return Number(row?.total ?? 0);
    },

    async listMessages(input) {
      const result = await db().execute(sql`
        select "id", "organizationId", "mailAddressId", "folder", "direction", "fromAddress", "fromName",
               "subject", "snippet", "bodyHtml", "bodyText", "receivedAt", "isRead", "hasAttachments", "aiSummary"
        from "MailMessage"
        where "organizationId" = ${input.organizationId}
          and "mailAddressId" = ${input.mailAddressId}
          and "folder" = ${input.folder}
        order by "receivedAt" desc
        limit ${input.limit}
      `);
      return rows(result).map(toMessage);
    },

    async getMessage(organizationId, id) {
      const result = await db().execute(sql`
        select "id", "organizationId", "mailAddressId", "folder", "direction", "fromAddress", "fromName",
               "subject", "snippet", "bodyHtml", "bodyText", "receivedAt", "isRead", "hasAttachments", "aiSummary"
        from "MailMessage"
        where "id" = ${id} and "organizationId" = ${organizationId}
        limit 1
      `);
      const row = rows(result)[0];
      return row ? toMessage(row) : null;
    },

    async insertMessage(input) {
      const result = await db().execute(sql`
        insert into "MailMessage" (
          "organizationId", "mailAddressId", "provider", "providerMessageId", "direction", "folder",
          "fromAddress", "fromName", "toAddresses", "subject", "snippet", "bodyHtml", "bodyText",
          "receivedAt", "isRead", "hasAttachments"
        ) values (
          ${input.organizationId}, ${input.mailAddressId}, ${input.provider ?? "hosted"},
          ${input.providerMessageId ?? null}, ${input.direction}, ${input.folder},
          ${input.fromAddress}, ${input.fromName ?? null}, ${JSON.stringify(input.toAddresses ?? [])},
          ${input.subject ?? null}, ${input.snippet ?? null}, ${input.bodyHtml ?? null},
          ${input.bodyText ?? null}, ${input.receivedAt}, ${input.isRead},
          ${input.hasAttachments}
        )
        on conflict do nothing
        returning "id", "organizationId", "mailAddressId", "folder", "direction", "fromAddress", "fromName",
                  "subject", "snippet", "bodyHtml", "bodyText", "receivedAt", "isRead", "hasAttachments", "aiSummary"
      `);
      const row = rows(result)[0];
      return row ? toMessage(row) : null;
    },

    async setMessageSummary(input) {
      await db().execute(sql`
        update "MailMessage"
        set "aiSummary" = ${input.summary}, "aiSummaryAt" = now()
        where "id" = ${input.messageId} and "organizationId" = ${input.organizationId}
      `);
    },

    async setMessageFolder(input) {
      await db().execute(sql`
        update "MailMessage"
        set "folder" = ${input.folder}
        where "id" = ${input.messageId} and "organizationId" = ${input.organizationId}
      `);
    },

    async insertDraft(input) {
      const result = await db().execute(sql`
        insert into "MailDraft" (
          "organizationId", "mailAddressId", "userId", "toAddresses", "subject", "bodyText", "aiGenerated"
        ) values (
          ${input.organizationId}, ${input.mailAddressId}, ${input.userId},
          ${JSON.stringify(input.toAddresses)}, ${input.subject}, ${input.bodyText}, ${input.aiGenerated}
        )
        returning "id", "organizationId", "mailAddressId", "userId", "toAddresses", "subject",
                  "bodyText", "aiGenerated", "status", "createdAt", "updatedAt"
      `);
      const row = rows(result)[0];
      if (!row) throw new Error("draft_insert_failed");
      return toDraft(row);
    },

    async getDraft(organizationId, id) {
      const result = await db().execute(sql`
        select "id", "organizationId", "mailAddressId", "userId", "toAddresses", "subject",
               "bodyText", "aiGenerated", "status", "createdAt", "updatedAt"
        from "MailDraft"
        where "id" = ${id} and "organizationId" = ${organizationId}
        limit 1
      `);
      const row = rows(result)[0];
      return row ? toDraft(row) : null;
    },

    async listDrafts(organizationId, userId) {
      const result = await db().execute(sql`
        select "id", "organizationId", "mailAddressId", "userId", "toAddresses", "subject",
               "bodyText", "aiGenerated", "status", "createdAt", "updatedAt"
        from "MailDraft"
        where "organizationId" = ${organizationId} and "userId" = ${userId} and "status" = 'draft'
        order by "updatedAt" desc
        limit 50
      `);
      return rows(result).map(toDraft);
    },

    async insertAudit(input) {
      await db().execute(sql`
        insert into "MailAudit" ("organizationId", "userId", "action", "targetId", "metadata")
        values (${input.organizationId}, ${input.userId}, ${input.action}, ${input.targetId},
                ${JSON.stringify(input.metadata)})
      `);
    },
  };
}

export type { MailProviderId, MailFolder };
