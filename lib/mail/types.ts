/**
 * The shapes ZOOKA Mail works with, and the repository contract it depends on.
 *
 * The interface exists so the rules can be tested without a database, and so
 * there is exactly one place where a query is written. Every read method takes
 * an organizationId: a query that cannot express "all tenants" cannot leak one.
 */

export const MAIL_FOLDERS = ["inbox", "sent", "drafts", "archive"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

export function isMailFolder(value: unknown): value is MailFolder {
  return typeof value === "string" && (MAIL_FOLDERS as readonly string[]).includes(value);
}

export type MailAddressStatus = "reserved" | "active" | "suspended";
export type MailProviderId = "hosted" | "gmail" | "outlook";

export type MailAddressRecord = {
  id: string;
  organizationId: string;
  userId: string;
  localPart: string;
  address: string;
  status: MailAddressStatus;
  provider: MailProviderId;
  createdAt: Date;
};

export type MailMessageRecord = {
  id: string;
  organizationId: string;
  mailAddressId: string;
  folder: MailFolder;
  direction: "inbound" | "outbound";
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  receivedAt: Date;
  isRead: boolean;
  hasAttachments: boolean;
  aiSummary: string | null;
};

export type MailDraftRecord = {
  id: string;
  organizationId: string;
  mailAddressId: string;
  userId: string;
  toAddresses: string[];
  subject: string | null;
  bodyText: string | null;
  aiGenerated: boolean;
  status: "draft" | "sent" | "discarded";
  createdAt: Date;
  updatedAt: Date;
};

export type MailAuditRecord = {
  organizationId: string;
  userId: string | null;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
};

export type MailRepository = {
  /** Returns null when the name is already taken; the unique index decides. */
  insertAddress(input: {
    organizationId: string;
    userId: string;
    localPart: string;
    address: string;
    provider: MailProviderId;
  }): Promise<MailAddressRecord | null>;
  findAddressByLocalPart(localPart: string): Promise<MailAddressRecord | null>;
  getAddress(organizationId: string, id: string): Promise<MailAddressRecord | null>;
  listAddresses(organizationId: string, userId: string): Promise<MailAddressRecord[]>;
  countAddresses(organizationId: string, userId?: string): Promise<number>;
  listMessages(input: {
    organizationId: string;
    mailAddressId: string;
    folder: MailFolder;
    limit: number;
  }): Promise<MailMessageRecord[]>;
  insertMessage(input: {
    organizationId: string;
    mailAddressId: string;
    folder: MailFolder;
    direction: "inbound" | "outbound";
    fromAddress: string;
    fromName: string | null;
    subject: string | null;
    snippet: string | null;
    bodyHtml: string | null;
    bodyText: string | null;
    receivedAt: Date;
    isRead: boolean;
    hasAttachments: boolean;
    aiSummary?: string | null;
    provider?: MailProviderId;
    providerMessageId?: string | null;
    toAddresses?: string[];
  }): Promise<MailMessageRecord | null>;
  getMessage(organizationId: string, id: string): Promise<MailMessageRecord | null>;
  setMessageSummary(input: {
    organizationId: string;
    messageId: string;
    summary: string;
  }): Promise<void>;
  setMessageFolder(input: {
    organizationId: string;
    messageId: string;
    folder: MailFolder;
  }): Promise<void>;
  insertDraft(input: {
    organizationId: string;
    mailAddressId: string;
    userId: string;
    toAddresses: string[];
    subject: string;
    bodyText: string;
    aiGenerated: boolean;
  }): Promise<MailDraftRecord>;
  getDraft(organizationId: string, id: string): Promise<MailDraftRecord | null>;
  listDrafts(organizationId: string, userId: string): Promise<MailDraftRecord[]>;
  insertAudit(input: MailAuditRecord): Promise<void>;
};
