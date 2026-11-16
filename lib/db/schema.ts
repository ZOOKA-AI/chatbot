import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  // Set only by the verification flow (pending migration 0029).
  emailVerifiedAt: timestamp("emailVerifiedAt"),
});

/**
 * One row per issued verification token. Only the SHA-256 digest is stored, so a
 * database read cannot be replayed as a working link. Single use is enforced by
 * a conditional UPDATE in lib/auth/verification.ts, not by reading first.
 */
export const emailVerificationToken = pgTable(
  "EmailVerificationToken",
  {
    tokenHash: varchar("tokenHash", { length: 64 }).primaryKey().notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("EmailVerificationToken_userId_idx").on(table.userId),
  })
);

export type User = InferSelectModel<typeof user>;

export const guestUsage = pgTable("GuestUsage", {
  key: varchar("key", { length: 128 }).primaryKey().notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const organization = pgTable("Organization", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const organizationMember = pgTable(
  "OrganizationMember",
  {
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: varchar("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.userId] }),
    userIndex: index("OrganizationMember_userId_idx").on(table.userId),
  })
);

export const googleDriveConnection = pgTable("GoogleDriveConnection", {
  organizationId: uuid("organizationId")
    .primaryKey()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  connectionId: uuid("connectionId").notNull().defaultRandom(),
  encryptedTokens: text("encryptedTokens").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const n8nConnection = pgTable("N8nConnection", {
  organizationId: uuid("organizationId")
    .primaryKey()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  encryptedCredentials: text("encryptedCredentials").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const oauthConnection = pgTable(
  "OAuthConnection",
  {
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    encryptedTokens: text("encryptedTokens").notNull(),
    accountId: text("accountId"),
    accountName: text("accountName"),
    avatarUrl: text("avatarUrl"),
    scopes: text("scopes"),
    tokenExpiresAt: timestamp("tokenExpiresAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.provider] }),
    providerIndex: index("OAuthConnection_provider_idx").on(table.provider),
  })
);

export const passwordResetToken = pgTable("PasswordResetToken", {
  tokenHash: varchar("tokenHash", { length: 64 }).primaryKey().notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const invitation = pgTable(
  "Invitation",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 254 }).notNull(),
    role: varchar("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    invitedBy: uuid("invitedBy")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
  },
  (table) => ({
    organizationEmailUnique: unique(
      "Invitation_organizationId_email_unique"
    ).on(table.organizationId, table.email),
    organizationIndex: index("Invitation_organizationId_idx").on(
      table.organizationId
    ),
  })
);

export const subscription = pgTable("Subscription", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  organizationId: uuid("organizationId")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  plan: varchar("plan", { enum: ["free", "pro", "business"] })
    .notNull()
    .default("free"),
  status: varchar("status", {
    enum: ["trialing", "active", "past_due", "canceled"],
  })
    .notNull()
    .default("active"),
  externalCustomerId: text("externalCustomerId"),
  externalSubscriptionId: text("externalSubscriptionId"),
  periodEnd: timestamp("periodEnd"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const usageEvent = pgTable(
  "UsageEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    event: varchar("event", { length: 64 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    organizationCreatedIndex: index(
      "UsageEvent_organizationId_createdAt_idx"
    ).on(table.organizationId, table.createdAt),
  })
);

export const chat = pgTable(
  "Chat",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    visibility: varchar("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("private"),
    deletedAt: timestamp("deletedAt"),
  },
  (table) => ({
    organizationCreatedIndex: index("Chat_organizationId_createdAt_idx").on(
      table.organizationId,
      table.createdAt
    ),
  })
);

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chatbot.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chatbot.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
      organizationIndex: index("Document_organizationId_idx").on(
        table.organizationId
      ),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

export const affiliate = pgTable("Affiliate", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  platform: varchar("platform", { length: 64 }),
  commissionPct: integer("commissionPct").notNull().default(20),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const referralEvent = pgTable(
  "ReferralEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    code: varchar("code", { length: 64 }).notNull(),
    event: varchar("event", { length: 16 }).notNull(),
    userId: uuid("userId"),
    organizationId: uuid("organizationId"),
    plan: varchar("plan", { length: 32 }),
    amountCents: integer("amountCents"),
    externalRef: varchar("externalRef", { length: 255 }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({ codeIdx: index("ReferralEvent_code_idx").on(table.code) })
);

export type Affiliate = InferSelectModel<typeof affiliate>;
/**
 * One Base44 Superagent conversation per workspace member, plus the running
 * per-user consumption (turns and agent credits) that the metered plan reads.
 */
export const base44AgentSession = pgTable("Base44AgentSession", {
  userId: uuid("userId")
    .primaryKey()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  organizationId: uuid("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  conversationId: text("conversationId").notNull(),
  turns: integer("turns").notNull().default(0),
  credits: integer("credits").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type ReferralEvent = InferSelectModel<typeof referralEvent>;

export const studioProject = pgTable(
  "StudioProject",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    html: text("html").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    orgIndex: index("StudioProject_organizationId_idx").on(table.organizationId),
  })
);

export type StudioProject = InferSelectModel<typeof studioProject>;

export const webhookEvent = pgTable(
  "WebhookEvent",
  {
    id: uuid("id").notNull().primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 32 }).notNull(),
    externalId: varchar("externalId", { length: 255 }).notNull(),
    payload: json("payload"),
    receivedAt: timestamp("receivedAt").notNull().defaultNow(),
  },
  (table) => ({
    providerExternalIdUnique: unique("WebhookEvent_provider_externalId_key").on(
      table.provider,
      table.externalId
    ),
    receivedAtIndex: index("WebhookEvent_receivedAt_idx").on(table.receivedAt),
  })
);

export const mediaJob = pgTable(
  "MediaJob",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actionType: varchar("actionType", { length: 16 }).notNull(),
    prompt: text("prompt").notNull(),
    status: varchar("status", {
      enum: ["queued", "running", "succeeded", "failed"],
    })
      .notNull()
      .default("queued"),
    assetUrl: text("assetUrl"),
    error: text("error"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    organizationCreatedAtIndex: index("MediaJob_organizationId_createdAt_idx").on(
      table.organizationId,
      table.createdAt
    ),
  })
);

export const project = pgTable(
  "Project",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId").notNull(),
    createdBy: uuid("createdBy"),
    name: text("name").notNull(),
    subdomain: varchar("subdomain", { length: 63 }).notNull(),
    customDomain: varchar("customDomain", { length: 253 }),
    status: varchar("status", { length: 16 }).notNull().default("CREATING"),
    templateId: text("templateId"),
    templateConfig: json("templateConfig"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    subdomainUnique: unique("Project_subdomain_unique").on(table.subdomain),
    organizationIdx: index("Project_organizationId_idx").on(table.organizationId),
  })
);

export type Project = InferSelectModel<typeof project>;

export const agentMessage = pgTable(
  "AgentMessage",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    organizationId: uuid("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("userId").notNull(),
    conversationKey: varchar("conversationKey", { length: 128 }).notNull(),
    role: varchar("role", { length: 16 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    conversationIdx: index("AgentMessage_conversationKey_createdAt_idx").on(
      table.conversationKey,
      table.createdAt
    ),
  })
);

export type AgentMessage = InferSelectModel<typeof agentMessage>;

/* -------------------------------------------------------------------------- */
/* ZOOKA AGENT COMMAND CENTER                                                 */
/*                                                                            */
/* Shared coordination state for every agent working on the project. Each     */
/* agent has its own identity and its own key (only the sha256 hash is        */
/* stored). Tasks are claimed atomically so the same task can never be        */
/* executed twice, and approvals / deployments keep a written trail.         */
/* -------------------------------------------------------------------------- */

export const agentIdentity = pgTable(
  "AgentIdentity",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    slug: varchar("slug", { length: 64 }).notNull(),
    displayName: varchar("displayName", { length: 120 }).notNull(),
    role: varchar("role", { length: 64 }).notNull(),
    keyHash: varchar("keyHash", { length: 64 }).notNull(),
    organizationId: varchar("organizationId", { length: 64 })
      .notNull()
      .default("unclaimed"),
    scopes: json("scopes").$type<string[]>().notNull().default([]),
    environment: varchar("environment", { length: 24 }).notNull().default("production"),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    lastSeenAt: timestamp("lastSeenAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("AgentIdentity_organizationId_idx").on(table.organizationId),
    slugIdx: unique("AgentIdentity_slug_key").on(table.slug),
    keyIdx: index("AgentIdentity_keyHash_idx").on(table.keyHash),
  })
);

export const agentTask = pgTable(
  "AgentTask",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    title: varchar("title", { length: 200 }).notNull(),
    instruction: text("instruction").notNull(),
    organizationId: varchar("organizationId", { length: 64 })
      .notNull()
      .default("unclaimed"),
    ownerAgentId: uuid("ownerAgentId").references(() => agentIdentity.id, {
      onDelete: "set null",
    }),
    priority: varchar("priority", { length: 16 }).notNull().default("normal"),
    dependencies: json("dependencies").$type<string[]>().notNull().default([]),
    environment: varchar("environment", { length: 24 }).notNull().default("production"),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    evidence: text("evidence"),
    approvalRequired: boolean("approvalRequired").notNull().default(false),
    rollbackPlan: text("rollbackPlan"),
    claimedAt: timestamp("claimedAt"),
    reportedAt: timestamp("reportedAt"),
    createdBy: varchar("createdBy", { length: 64 }).notNull().default("owner"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("AgentTask_organizationId_idx").on(table.organizationId),
    statusIdx: index("AgentTask_status_idx").on(table.status),
    ownerIdx: index("AgentTask_ownerAgentId_idx").on(table.ownerAgentId),
  })
);

export const agentDecision = pgTable(
  "AgentDecision",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    agentId: uuid("agentId").references(() => agentIdentity.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    organizationId: varchar("organizationId", { length: 64 })
      .notNull()
      .default("unclaimed"),
    state: varchar("state", { length: 24 }).notNull().default("PROPOSED"),
    taskId: uuid("taskId").references(() => agentTask.id, { onDelete: "set null" }),
    approvalId: uuid("approvalId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("AgentDecision_organizationId_idx").on(table.organizationId),
    stateIdx: index("AgentDecision_state_idx").on(table.state),
    // One decision record per approval, enforced by the database rather than by
    // the code path that happens to write it.
    approvalIdx: uniqueIndex("AgentDecision_approvalId_key").on(table.approvalId),
  })
);

export const agentApproval = pgTable(
  "AgentApproval",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    taskId: uuid("taskId").references(() => agentTask.id, { onDelete: "cascade" }),
    requestedBy: uuid("requestedBy").references(() => agentIdentity.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    organizationId: varchar("organizationId", { length: 64 })
      .notNull()
      .default("unclaimed"),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    decidedBy: varchar("decidedBy", { length: 64 }),
    decidedAt: timestamp("decidedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("AgentApproval_organizationId_idx").on(table.organizationId),
    statusIdx: index("AgentApproval_status_idx").on(table.status),
  })
);

export const agentDeployment = pgTable(
  "AgentDeployment",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    environment: varchar("environment", { length: 24 }).notNull().default("production"),
    organizationId: varchar("organizationId", { length: 64 })
      .notNull()
      .default("unclaimed"),
    commitSha: varchar("commitSha", { length: 64 }),
    deploymentId: varchar("deploymentId", { length: 120 }),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    notes: text("notes"),
    agentId: uuid("agentId").references(() => agentIdentity.id, { onDelete: "set null" }),
    rollbackOf: uuid("rollbackOf"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("AgentDeployment_organizationId_idx").on(table.organizationId),
    envIdx: index("AgentDeployment_environment_idx").on(table.environment),
  })
);
