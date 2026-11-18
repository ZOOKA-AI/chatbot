import type {
  MailAddressRecord,
  MailAuditRecord,
  MailDraftRecord,
  MailMessageRecord,
  MailRepository,
} from "@/lib/mail/types";

/**
 * An in-memory repository that behaves like the real one where it matters:
 * insertAddress is atomic and returns null on a duplicate, exactly as
 * ON CONFLICT DO NOTHING does. That is the property the reservation race
 * depends on, so the fake has to keep it rather than simulate it loosely.
 */
export function createFakeRepo() {
  const addresses = new Map<string, MailAddressRecord>();
  const messages = new Map<string, MailMessageRecord>();
  const drafts = new Map<string, MailDraftRecord>();
  const audits: MailAuditRecord[] = [];
  let counter = 0;

  const repo: MailRepository = {
    async insertAddress(input) {
      if (addresses.has(input.localPart)) return null;
      counter += 1;
      const record: MailAddressRecord = {
        id: `addr-${counter}`,
        organizationId: input.organizationId,
        userId: input.userId,
        localPart: input.localPart,
        address: input.address,
        status: "reserved",
        provider: input.provider,
        createdAt: new Date(2026, 10, 18, 12, 0, counter),
      };
      addresses.set(input.localPart, record);
      return record;
    },
    async findAddressByLocalPart(localPart) {
      return addresses.get(localPart) ?? null;
    },
    async getAddress(organizationId, id) {
      const found = [...addresses.values()].find(
        (entry) => entry.id === id && entry.organizationId === organizationId
      );
      return found ?? null;
    },
    async listAddresses(organizationId, userId) {
      return [...addresses.values()].filter(
        (entry) => entry.organizationId === organizationId && entry.userId === userId
      );
    },
    async countAddresses(organizationId, userId) {
      return [...addresses.values()].filter(
        (entry) =>
          entry.organizationId === organizationId &&
          (userId === undefined || entry.userId === userId)
      ).length;
    },
    async listMessages(input) {
      return [...messages.values()].filter(
        (entry) =>
          entry.organizationId === input.organizationId &&
          entry.mailAddressId === input.mailAddressId &&
          entry.folder === input.folder
      );
    },
    async getMessage(organizationId, id) {
      const found = messages.get(id);
      return found && found.organizationId === organizationId ? found : null;
    },
    async insertMessage(input) {
      counter += 1;
      const record: MailMessageRecord = {
        ...input,
        id: `msg-${counter}`,
        aiSummary: input.aiSummary ?? null,
      };
      messages.set(record.id, record);
      return record;
    },
    async setMessageSummary(input) {
      const found = messages.get(input.messageId);
      if (found && found.organizationId === input.organizationId) {
        found.aiSummary = input.summary;
      }
    },
    async setMessageFolder(input) {
      const found = messages.get(input.messageId);
      if (found && found.organizationId === input.organizationId) {
        found.folder = input.folder;
      }
    },
    async insertDraft(input) {
      counter += 1;
      const record: MailDraftRecord = {
        id: `draft-${counter}`,
        organizationId: input.organizationId,
        mailAddressId: input.mailAddressId,
        userId: input.userId,
        toAddresses: input.toAddresses,
        subject: input.subject,
        bodyText: input.bodyText,
        aiGenerated: input.aiGenerated,
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      drafts.set(record.id, record);
      return record;
    },
    async getDraft(organizationId, id) {
      const found = drafts.get(id);
      return found && found.organizationId === organizationId ? found : null;
    },
    async listDrafts(organizationId, userId) {
      return [...drafts.values()].filter(
        (entry) => entry.organizationId === organizationId && entry.userId === userId
      );
    },
    async insertAudit(input) {
      audits.push(input);
    },
  };

  return { repo, addresses, messages, drafts, audits };
}

export function makeMessage(overrides: Partial<MailMessageRecord> = {}): MailMessageRecord {
  return {
    id: "msg-1",
    organizationId: "org-a",
    mailAddressId: "addr-1",
    folder: "inbox",
    direction: "inbound",
    fromAddress: "sender@example.com",
    fromName: "Sender",
    subject: "Hello",
    snippet: "short",
    bodyHtml: "<p>Hello</p>",
    bodyText: "Hello",
    receivedAt: new Date("2026-11-18T10:00:00Z"),
    isRead: false,
    hasAttachments: false,
    aiSummary: null,
    ...overrides,
  };
}
