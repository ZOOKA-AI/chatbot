import "server-only";

import type { Attribution } from "@/lib/growth/attribution";
import { accountDatabaseError } from "./diagnostics";
import { commanderActiveDb } from "./tenant-context";
import { serviceConnectionAvailable, serviceDb } from "./service-client";
import { tenantScopeEnabled } from "./tenant";

import { agentMessage } from "./schema";

import { del as deleteBlob, list as listBlobs } from "@vercel/blob";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lt,
  ne,
  or,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import { drizzleDateSafe } from "@/lib/db/date-params";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import { defaultWorkspaceNameForEmail } from "../workspace-name";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  googleDriveConnection,
  oauthConnection,
  passwordResetToken,
  guestUsage,
  invitation,
  message,
  messageDeprecated,
  organization,
  organizationMember,
  type Suggestion,
  stream,
  subscription,
  suggestion,
  type User,
  usageEvent,
  user,
  vote,
  voteDeprecated,
  mediaJob,
} from "./schema";
import { generateHashedPassword } from "./utils";
import { claimPasswordResetToken } from "@/lib/auth/verification";
import { mediaJobUpdateQuery, type MediaJobUpdate } from "./media-job-state";
import { pgError } from "./errors";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
// CUTOVER: DATABASE_URL (Supabase pooler) يتقدم على POSTGRES_URL القديم —
// حذف DATABASE_URL من Vercel يعيد التطبيق للقاعدة القديمة فورًا (rollback بمتغير واحد).
const connectionString =
  process.env.DATABASE_URL ?? (process.env.POSTGRES_URL as string);
// Fluid compute serves many requests per instance; a single connection made
// concurrent chat requests queue behind each other (seen as 300s timeouts).
// The Supabase transaction pooler handles a small per-instance pool safely.
const client = postgres(connectionString, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});
const sharedDb = drizzleDateSafe(client);

/**
 * Handle for writes that legitimately happen before, or outside, a tenant scope:
 * the first organisation and membership at onboarding, administrator membership
 * changes, and subscription lifecycle from a signature-verified webhook.
 *
 * Falls back to the request handle while enforcement is off, so behaviour is
 * unchanged until the flag flips.
 */
export function adminDb() {
  if (!tenantScopeEnabled()) {
    return db;
  }
  if (!serviceConnectionAvailable()) {
    // Fail loudly rather than letting an onboarding write die inside a policy
    // error that reads like a bug in the policy.
    throw new Error(
      "DATABASE_URL_SERVICE is required when tenant RLS is enabled: administrative writes (onboarding, membership, subscription) have no tenant scope"
    );
  }
  return serviceDb();
}

/**
 * The database handle the application uses.
 *
 * When a request has published its tenant transaction (see request-tenant.ts),
 * this resolves to that transaction, so every query issued by the handler is
 * evaluated against the caller's tenant policies without changing the forty-odd
 * call sites that import `db`.
 *
 * When nothing is published it resolves to the shared connection, which is the
 * unchanged behaviour while enforcement is off.
 */
export const db = new Proxy(sharedDb as unknown as object, {
  get(target, property) {
    const active = commanderActiveDb() as Record<string | symbol, unknown> | null;
    const resolved = (active ?? target) as Record<string | symbol, unknown>;
    const value = Reflect.get(resolved, property, resolved);
    return typeof value === "function" ? value.bind(resolved) : value;
  },
}) as typeof sharedDb;

async function retryBlobRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation(AbortSignal.timeout(45_000));
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250)
      );
    }
  }
  throw new Error("Blob request failed");
}

export function deleteAccountData(userId: string) {
  return db.transaction(async (tx) => {
    const memberships = await tx
      .select({
        organizationId: organizationMember.organizationId,
        role: organizationMember.role,
      })
      .from(organizationMember)
      .where(eq(organizationMember.userId, userId));
    const ownedOrganizationIds = memberships
      .filter(({ role }) => role === "owner")
      .map(({ organizationId }) => organizationId);

    if (ownedOrganizationIds.length > 0) {
      const [otherMember] = await tx
        .select({ userId: organizationMember.userId })
        .from(organizationMember)
        .where(
          and(
            inArray(organizationMember.organizationId, ownedOrganizationIds),
            ne(organizationMember.userId, userId)
          )
        )
        .limit(1);
      if (otherMember) {
        return {
          deleted: false as const,
          reason: "workspace_members" as const,
        };
      }

      const paidSubscriptions = await tx
        .select({ status: subscription.status, plan: subscription.plan })
        .from(subscription)
        .where(
          and(
            inArray(subscription.organizationId, ownedOrganizationIds),
            ne(subscription.plan, "free")
          )
        );
      if (
        paidSubscriptions.some(({ status }) =>
          ["active", "trialing", "past_due"].includes(status)
        )
      ) {
        return {
          deleted: false as const,
          reason: "active_subscription" as const,
        };
      }
    }

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken && memberships.length > 0) {
      return {
        deleted: false as const,
        reason: "blob_storage_unavailable" as const,
      };
    }

    const blobUrls: string[] = [];
    if (blobToken) {
      for (const { organizationId } of memberships) {
        const prefix = `${organizationId}/${userId}/`;
        let cursor: string | undefined;
        do {
          const result = await retryBlobRequest((abortSignal) =>
            listBlobs({
              prefix,
              cursor,
              limit: 1000,
              token: blobToken,
              abortSignal,
            })
          );
          blobUrls.push(...result.blobs.map(({ url }) => url));
          if (result.hasMore && !result.cursor) {
            throw new Error("Blob list pagination is incomplete");
          }
          cursor = result.hasMore ? result.cursor : undefined;
        } while (cursor);
      }

      for (let index = 0; index < blobUrls.length; index += 500) {
        const batch = blobUrls.slice(index, index + 500);
        await retryBlobRequest((abortSignal) =>
          deleteBlob(batch, { token: blobToken, abortSignal })
        );
      }
    }

    const ownedChatRows = await tx
      .select({ id: chat.id })
      .from(chat)
      .where(
        ownedOrganizationIds.length > 0
          ? or(
              eq(chat.userId, userId),
              inArray(chat.organizationId, ownedOrganizationIds)
            )
          : eq(chat.userId, userId)
      );
    const chatIds = ownedChatRows.map(({ id }) => id);
    const ownedDocuments = await tx
      .select({ id: document.id })
      .from(document)
      .where(
        ownedOrganizationIds.length > 0
          ? or(
              eq(document.userId, userId),
              inArray(document.organizationId, ownedOrganizationIds)
            )
          : eq(document.userId, userId)
      );
    const documentIds = [...new Set(ownedDocuments.map(({ id }) => id))];

    if (documentIds.length > 0) {
      await tx
        .delete(suggestion)
        .where(inArray(suggestion.documentId, documentIds));
    }
    await tx.delete(suggestion).where(eq(suggestion.userId, userId));

    if (chatIds.length > 0) {
      await tx.delete(vote).where(inArray(vote.chatId, chatIds));
      await tx
        .delete(voteDeprecated)
        .where(inArray(voteDeprecated.chatId, chatIds));
      await tx.delete(message).where(inArray(message.chatId, chatIds));
      await tx
        .delete(messageDeprecated)
        .where(inArray(messageDeprecated.chatId, chatIds));
      await tx.delete(stream).where(inArray(stream.chatId, chatIds));
      await tx.delete(chat).where(inArray(chat.id, chatIds));
    }
    if (ownedOrganizationIds.length > 0) {
      await tx
        .delete(invitation)
        .where(inArray(invitation.organizationId, ownedOrganizationIds));
      await tx
        .delete(usageEvent)
        .where(inArray(usageEvent.organizationId, ownedOrganizationIds));
      await tx
        .delete(subscription)
        .where(inArray(subscription.organizationId, ownedOrganizationIds));
    }
    await tx.delete(invitation).where(eq(invitation.invitedBy, userId));
    await tx.delete(usageEvent).where(eq(usageEvent.userId, userId));
    await tx
      .delete(document)
      .where(
        ownedOrganizationIds.length > 0
          ? or(
              eq(document.userId, userId),
              inArray(document.organizationId, ownedOrganizationIds)
            )
          : eq(document.userId, userId)
      );
    await tx
      .delete(organizationMember)
      .where(
        ownedOrganizationIds.length > 0
          ? or(
              eq(organizationMember.userId, userId),
              inArray(organizationMember.organizationId, ownedOrganizationIds)
            )
          : eq(organizationMember.userId, userId)
      );
    if (ownedOrganizationIds.length > 0) {
      await tx
        .delete(organization)
        .where(inArray(organization.id, ownedOrganizationIds));
    }
    await tx.delete(user).where(eq(user.id, userId));

    return { deleted: true as const };
  });
}

export async function getWorkspaceForUser(
  userId: string,
  organizationId?: string
) {
  // Discovering which workspace a user belongs to happens before any tenant is
  // known, so it cannot run on the runtime role under RLS: it uses the bootstrap
  // connection (which is the shared handle while enforcement is off).
  const [workspace] = await adminDb()
    .select({
      id: organization.id,
      name: organization.name,
      role: organizationMember.role,
    })
    .from(organizationMember)
    .innerJoin(
      organization,
      eq(organizationMember.organizationId, organization.id)
    )
    .where(
      organizationId
        ? and(
            eq(organizationMember.userId, userId),
            eq(organizationMember.organizationId, organizationId)
          )
        : eq(organizationMember.userId, userId)
    )
    .orderBy(asc(organizationMember.createdAt))
    .limit(1);

  return workspace ?? null;
}

export function getWorkspacesForUser(userId: string) {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      role: organizationMember.role,
    })
    .from(organizationMember)
    .innerJoin(
      organization,
      eq(organizationMember.organizationId, organization.id)
    )
    .where(eq(organizationMember.userId, userId))
    .orderBy(asc(organizationMember.createdAt));
}

/**
 * Creates the first organisation for an account.
 *
 * Onboarding runs inside one transaction and only for an account that exists.
 * Both rules are load bearing: a session token can outlive its user row (the
 * account is deleted, the cookie is still valid), and the earlier code inserted
 * the organisation first, so a failing membership insert left an empty
 * organisation behind on every attempt. Under tenant enforcement those orphans
 * accumulate silently: the workspace is never reachable, and nothing reports it.
 *
 * Returns null when there is no such user, which unsets the organisation on the
 * caller's token instead of inventing one.
 */
export async function ensureUserWorkspace({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<{ id: string; name: string; role: string } | null> {
  const existingWorkspace = await getWorkspaceForUser(userId);
  if (existingWorkspace) {
    return existingWorkspace;
  }

  return adminDb().transaction(async (tx) => {
    const [account] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!account) {
      return null;
    }

    const [createdWorkspace] = await tx
      .insert(organization)
      .values({ name: defaultWorkspaceNameForEmail(email) })
      .returning({ id: organization.id, name: organization.name });

    await tx
      .insert(organizationMember)
      .values({
        organizationId: createdWorkspace.id,
        userId,
        role: "owner",
      })
      .onConflictDoNothing();
    await tx
      .insert(subscription)
      .values({ organizationId: createdWorkspace.id })
      .onConflictDoNothing();

    return { ...createdWorkspace, role: "owner" };
  });
}

export function getWorkspaceMembers(organizationId: string) {
  return db
    .select({
      userId: user.id,
      email: user.email,
      role: organizationMember.role,
      joinedAt: organizationMember.createdAt,
    })
    .from(organizationMember)
    .innerJoin(user, eq(organizationMember.userId, user.id))
    .where(eq(organizationMember.organizationId, organizationId))
    .orderBy(asc(organizationMember.createdAt));
}

export function updateWorkspaceMemberRole({
  organizationId,
  userId,
  role,
}: {
  organizationId: string;
  userId: string;
  role: "admin" | "member";
}) {
  return db
    .update(organizationMember)
    .set({ role })
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        eq(organizationMember.userId, userId),
        ne(organizationMember.role, "owner")
      )
    );
}

export function addWorkspaceMember({
  organizationId,
  userId,
  role,
}: {
  organizationId: string;
  userId: string;
  role: "admin" | "member";
}) {
  return adminDb()
    .insert(organizationMember)
    .values({ organizationId, userId, role })
    .onConflictDoNothing();
}

export function getWorkspaceInvitations(organizationId: string) {
  return db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
    })
    .from(invitation)
    .where(eq(invitation.organizationId, organizationId))
    .orderBy(desc(invitation.createdAt));
}

export function updateWorkspaceName({
  organizationId,
  name,
}: {
  organizationId: string;
  name: string;
}) {
  return db
    .update(organization)
    .set({ name })
    .where(eq(organization.id, organizationId));
}

export function createWorkspaceInvitation({
  organizationId,
  invitedBy,
  email,
  role,
}: {
  organizationId: string;
  invitedBy: string;
  email: string;
  role: "admin" | "member";
}) {
  return db
    .insert(invitation)
    .values({
      organizationId,
      invitedBy,
      email,
      role,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoUpdate({
      target: [invitation.organizationId, invitation.email],
      set: {
        role,
        invitedBy,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: null,
      },
    });
}

export async function getWorkspaceBilling(organizationId: string) {
  const [currentSubscription] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.organizationId, organizationId))
    .limit(1);
  const [usage] = await db
    .select({ messages: sum(usageEvent.quantity) })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.organizationId, organizationId),
        eq(usageEvent.event, "chat_message"),
        gte(
          usageEvent.createdAt,
          new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
          )
        )
      )
    );
  const [agentUsage] = await db
    .select({ runs: sum(usageEvent.quantity) })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.organizationId, organizationId),
        eq(usageEvent.event, "agent_run"),
        gte(
          usageEvent.createdAt,
          new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
          )
        )
      )
    );
  const [webSearchUsage] = await db
    .select({ searches: sum(usageEvent.quantity) })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.organizationId, organizationId),
        eq(usageEvent.event, "web_search"),
        gte(
          usageEvent.createdAt,
          new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
          )
        )
      )
    );

  return {
    subscription: currentSubscription ?? null,
    usage: {
      messages: Number(usage?.messages ?? 0),
      agentRuns: Number(agentUsage?.runs ?? 0),
      webSearches: Number(webSearchUsage?.searches ?? 0),
    },
  };
}

export function syncWorkspaceSubscription({
  organizationId,
  plan,
  status,
  externalCustomerId,
  externalSubscriptionId,
  periodEnd,
}: {
  organizationId: string;
  plan: "free" | "pro" | "business";
  status: "trialing" | "active" | "past_due" | "canceled";
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  periodEnd: Date | null;
}) {
  return adminDb()
    .insert(subscription)
    .values({
      organizationId,
      plan,
      status,
      externalCustomerId,
      externalSubscriptionId,
      periodEnd,
    })
    .onConflictDoUpdate({
      target: subscription.organizationId,
      set: {
        plan,
        status,
        externalCustomerId,
        externalSubscriptionId,
        periodEnd,
      },
    });
}

export async function incrementGuestUsage(key: string) {
  // Opportunistically prune per-IP rows from previous days; they are dead
  // once their date suffix has passed and would otherwise accumulate forever.
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  try {
    await adminDb()
      .delete(guestUsage)
      .where(
        and(like(guestUsage.key, "ip:%"), lt(guestUsage.updatedAt, cutoff))
      );
  } catch {
    // Pruning is best-effort; never block the request on it.
  }

  const [row] = await adminDb()
    .insert(guestUsage)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: guestUsage.key,
      set: { count: sql`${guestUsage.count} + 1`, updatedAt: new Date() },
    })
    .returning({ count: guestUsage.count });
  return row.count;
}

/*
 * Atomically claim one unit of a daily allowance. A single statement, so ten
 * parallel requests can never overshoot the cap: when the row is already at the
 * limit the conditional update matches nothing and no row is returned.
 */
export async function tryClaimGuestUsage(key: string, limit: number) {
  const rows = (await adminDb().execute(sql`
    INSERT INTO "GuestUsage" ("key", "count", "updatedAt")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE
      SET "count" = "GuestUsage"."count" + 1, "updatedAt" = now()
      WHERE "GuestUsage"."count" < ${limit}
    RETURNING "count"
  `)) as unknown as { count?: number }[];
  const claimed = rows?.[0]?.count;
  return typeof claimed === "number" ? claimed : null;
}

export async function tryClaimDemoMinute(key: string, limit: number) {
  const rows = (await adminDb().execute(sql`
    INSERT INTO "GuestUsage" ("key", "count", "updatedAt")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "GuestUsage"."updatedAt" <= now() - interval '60 seconds'
        THEN 1 ELSE "GuestUsage"."count" + 1 END,
      "updatedAt" = CASE WHEN "GuestUsage"."updatedAt" <= now() - interval '60 seconds'
        THEN now() ELSE "GuestUsage"."updatedAt" END
    WHERE "GuestUsage"."updatedAt" <= now() - interval '60 seconds'
      OR "GuestUsage"."count" < ${limit}
    RETURNING "count"
  `)) as unknown as { count?: number }[];
  return typeof rows?.[0]?.count === "number";
}

export async function pruneDemoMinuteLimits() {
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await adminDb()
    .delete(guestUsage)
    .where(and(like(guestUsage.key, "demo-minute:%"), lt(guestUsage.updatedAt, cutoff)));
}

/* Hand a claimed unit back, e.g. when the reply failed before its first token. */
export async function releaseGuestUsage(key: string) {
  try {
    await adminDb().execute(sql`
      UPDATE "GuestUsage"
      SET "count" = GREATEST("count" - 1, 0), "updatedAt" = now()
      WHERE "key" = ${key}
    `);
  } catch {
    // Bookkeeping must never block or fail a visitor's reply.
  }
}

export async function getGuestUsage(key: string) {
  try {
    const [row] = await adminDb()
      .select({ count: guestUsage.count })
      .from(guestUsage)
      .where(eq(guestUsage.key, key))
      .limit(1);
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export function trackWorkspaceUsage({
  organizationId,
  userId,
  event,
  quantity = 1,
}: {
  organizationId: string;
  userId: string;
  event: string;
  quantity?: number;
}) {
  return db.insert(usageEvent).values({
    organizationId,
    userId,
    event,
    quantity,
  });
}

export async function getUser(email: string): Promise<User[]> {
  try {
    // Identity lookup is pre-tenant: it runs during login, before any session
    // exists, so there is no organisation to scope by. With tenant RLS on, the
    // runtime role cannot read "User" without app.user_id, so this uses the
    // bootstrap connection (flag off: that is still the shared handle).
    return await adminDb().select().from(user).where(eq(user.email, email));
  } catch (error) {
    throw accountDatabaseError("lookup", error);
  }
}

export async function createUser(
  email: string,
  password: string,
  attribution?: Attribution | null
) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await adminDb()
      .insert(user)
      .values({
        email,
        password: hashedPassword,
        // Null when the visit carried no channel: an invented source is worse
        // than an empty one for every later decision made from this table.
        signupSource: attribution?.source ?? null,
        signupMedium: attribution?.medium ?? null,
        signupCampaign: attribution?.campaign ?? null,
        signupReferrer: attribution?.referrer ?? null,
      });
  } catch (error) {
    throw accountDatabaseError("create", error);
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
  id,
  userId,
  organizationId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  organizationId: string;
  title: string;
  visibility: VisibilityType;
}) {
  let inserted: { id: string }[];
  try {
    // ON CONFLICT DO NOTHING instead of letting the primary key reject the row: a
    // chat id that already exists but belongs to another workspace is invisible to
    // the lookup before this call (organisation filter, and RLS when the tenant
    // flag is on), so the caller reaches here. A raised unique violation aborted
    // the tenant transaction and surfaced as a 500; an empty insert lets the
    // route answer 403 and leaves the transaction usable.
    inserted = await db
      .insert(chat)
      .values({
        id,
        createdAt: new Date(),
        userId,
        organizationId,
        title,
        visibility,
      })
      .onConflictDoNothing({ target: chat.id })
      .returning({ id: chat.id });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
  if (inserted.length === 0) {
    throw new ChatbotError("forbidden:chat");
  }
  return inserted;
}

export async function deleteChatById({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  try {
    const [selectedChat] = await db
      .select({ id: chat.id })
      .from(chat)
      .where(and(eq(chat.id, id), eq(chat.organizationId, organizationId)));

    if (!selectedChat) {
      return undefined;
    }

    // Soft delete: the row and its messages stay, so a mistake is reversible.
    const [chatsDeleted] = await db
      .update(chat)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(chat.id, id),
          eq(chat.organizationId, organizationId),
          isNull(chat.deletedAt)
        )
      )
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByOrganizationId({
  organizationId,
}: {
  organizationId: string;
}) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.organizationId, organizationId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.organizationId, organizationId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByOrganizationId({
  organizationId,
  userId,
  limit,
  startingAfter,
  endingBefore,
}: {
  organizationId: string;
  userId: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;
    const visibleToUser = and(
      or(eq(chat.userId, userId), eq(chat.visibility, "public")),
      isNull(chat.deletedAt)
    );

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(
                whereCondition,
                eq(chat.organizationId, organizationId),
                visibleToUser
              )
            : and(eq(chat.organizationId, organizationId), visibleToUser)
        )
        .orderBy(desc(chat.createdAt), desc(chat.id))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(
          and(
            eq(chat.id, startingAfter),
            eq(chat.organizationId, organizationId),
            visibleToUser
          )
        )
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(
        or(
          gt(chat.createdAt, selectedChat.createdAt),
          and(
            eq(chat.createdAt, selectedChat.createdAt),
            gt(chat.id, selectedChat.id)
          )
        )
      );
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(
          and(
            eq(chat.id, endingBefore),
            eq(chat.organizationId, organizationId),
            visibleToUser
          )
        )
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(
        or(
          lt(chat.createdAt, selectedChat.createdAt),
          and(
            eq(chat.createdAt, selectedChat.createdAt),
            lt(chat.id, selectedChat.id)
          )
        )
      );
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  try {
    const [selectedChat] = await db
      .select()
      .from(chat)
      .where(and(eq(chat.id, id), eq(chat.organizationId, organizationId)));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({
  messages,
  organizationId,
}: {
  messages: DBMessage[];
  organizationId: string;
}) {
  if (messages.length === 0) {
    return;
  }

  const chatIds = [...new Set(messages.map(({ chatId }) => chatId))];
  const tenantChats = await db
    .select({ id: chat.id })
    .from(chat)
    .where(
      and(inArray(chat.id, chatIds), eq(chat.organizationId, organizationId))
    );
  if (tenantChats.length !== chatIds.length) {
    throw new ChatbotError("forbidden:chat");
  }

  // نفس المعرّف قد يصل مرة أخرى عند التعديل أو إعادة التوليد: نُحدّث النص بدل رفضه،
  // أو من onFinish بعد أن حُفظت في بداية الطلب، ولا يجوز أن تُسقط الحفظ كله.
  const uniqueMessages = [...new Map(messages.map((m) => [m.id, m])).values()];
  const traceId = `save_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // حارس الملكية: معرّف الرسالة وحده ليس مفتاح ثقة. التحديث عند التعارض مسموح
  // فقط إذا كانت الرسالة القائمة في نفس المحادثة وبنفس الدور، وإلا يُرفض الطلب
  // بدل الكتابة فوق رسالة تنتمي إلى محادثة أو مساحة عمل أخرى.
  const incomingIds = [...new Set(messages.map(({ id }) => id))];
  const existingRows = await db
    .select({ id: message.id, chatId: message.chatId, role: message.role })
    .from(message)
    .where(inArray(message.id, incomingIds));
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  for (const incoming of messages) {
    const existing = existingById.get(incoming.id);
    if (
      existing &&
      (existing.chatId !== incoming.chatId || existing.role !== incoming.role)
    ) {
      console.error("[db] saveMessages rejected mismatched message id", {
        traceId,
        incomingChatId: incoming.chatId,
      });
      throw new ChatbotError("forbidden:chat");
    }
  }

  try {
    for (let index = 0; index < uniqueMessages.length; index += 50) {
      await db
        .insert(message)
        .values(uniqueMessages.slice(index, index + 50))
        .onConflictDoUpdate({
          target: message.id,
          set: { parts: sql`excluded.parts` },
          // حماية ثانية على مستوى القاعدة: لا تحديث إن اختلفت المحادثة أو الدور.
          setWhere: sql`${message.chatId} = excluded."chatId" and ${message.role} = excluded."role"`,
        });
    }
  } catch (error) {
    const details = pgError(error);
    // لا نُسجّل detail الخام لأنه قد يحوي قيماً من صفوف المستخدم.
    console.error("[db] saveMessages failed", {
      code: details.code,
      constraint: details.constraint,
      traceId,
      chatIds,
      messageCount: uniqueMessages.length,
    });
    if (details.code === "23503") {
      throw new ChatbotError("bad_request:database", "Chat not found");
    }
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
  organizationId,
}: {
  id: string;
  parts: DBMessage["parts"];
  organizationId: string;
}) {
  try {
    return await db
      .update(message)
      .set({ parts })
      .where(
        inArray(
          message.id,
          db
            .select({ id: message.id })
            .from(message)
            .innerJoin(chat, eq(message.chatId, chat.id))
            .where(
              and(eq(message.id, id), eq(chat.organizationId, organizationId))
            )
        )
      );
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  try {
    return await db
      .select({
        id: message.id,
        chatId: message.chatId,
        role: message.role,
        parts: message.parts,
        attachments: message.attachments,
        createdAt: message.createdAt,
      })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(eq(message.chatId, id), eq(chat.organizationId, organizationId))
      )
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
  organizationId,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
  organizationId: string;
}) {
  try {
    const [scopedMessage] = await db
      .select({ id: message.id })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(message.id, messageId),
          eq(message.chatId, chatId),
          eq(chat.organizationId, organizationId)
        )
      );
    if (!scopedMessage) {
      throw new ChatbotError("not_found:vote");
    }

    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  try {
    return await db
      .select({
        chatId: vote.chatId,
        messageId: vote.messageId,
        isUpvoted: vote.isUpvoted,
      })
      .from(vote)
      .innerJoin(chat, eq(vote.chatId, chat.id))
      .where(and(eq(vote.chatId, id), eq(chat.organizationId, organizationId)));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
  organizationId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
  organizationId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        organizationId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(
        and(eq(document.id, id), eq(document.organizationId, organizationId))
      )
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({
  id,
  organizationId,
}: {
  id: string;
  organizationId: string;
}) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(
        and(eq(document.id, id), eq(document.organizationId, organizationId))
      )
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
  organizationId,
}: {
  id: string;
  timestamp: Date;
  organizationId: string;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          inArray(
            suggestion.documentId,
            db
              .selectDistinct({ id: document.id })
              .from(document)
              .where(eq(document.organizationId, organizationId))
          ),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(
        and(
          eq(document.id, id),
          eq(document.organizationId, organizationId),
          gt(document.createdAt, timestamp)
        )
      )
      .returning();
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
  organizationId,
}: {
  suggestions: Suggestion[];
  organizationId: string;
}) {
  try {
    const documentIds = [
      ...new Set(suggestions.map(({ documentId }) => documentId)),
    ];
    if (documentIds.length === 0) {
      return;
    }

    const tenantDocuments = await db
      .selectDistinct({ id: document.id })
      .from(document)
      .where(
        and(
          inArray(document.id, documentIds),
          eq(document.organizationId, organizationId)
        )
      );
    if (tenantDocuments.length !== documentIds.length) {
      throw new ChatbotError("forbidden:document");
    }

    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
  organizationId,
}: {
  documentId: string;
  organizationId: string;
}) {
  try {
    return await db
      .select({
        id: suggestion.id,
        documentId: suggestion.documentId,
        documentCreatedAt: suggestion.documentCreatedAt,
        originalText: suggestion.originalText,
        suggestedText: suggestion.suggestedText,
        description: suggestion.description,
        isResolved: suggestion.isResolved,
        userId: suggestion.userId,
        createdAt: suggestion.createdAt,
      })
      .from(suggestion)
      .innerJoin(
        document,
        and(
          eq(suggestion.documentId, document.id),
          eq(suggestion.documentCreatedAt, document.createdAt)
        )
      )
      .where(
        and(
          eq(suggestion.documentId, documentId),
          eq(document.organizationId, organizationId)
        )
      );
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({
  id,
  organizationId,
  userId,
}: {
  id: string;
  organizationId: string;
  userId: string;
}) {
  try {
    return await db
      .select({
        id: message.id,
        chatId: message.chatId,
        createdAt: message.createdAt,
      })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(message.id, id),
          eq(chat.organizationId, organizationId),
          eq(chat.userId, userId)
        )
      );
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
  organizationId,
}: {
  chatId: string;
  timestamp: Date;
  organizationId: string;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(message.chatId, chatId),
          eq(chat.organizationId, organizationId),
          gte(message.createdAt, timestamp)
        )
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
  organizationId,
}: {
  chatId: string;
  visibility: "private" | "public";
  organizationId: string;
}) {
  try {
    return await db
      .update(chat)
      .set({ visibility })
      .where(and(eq(chat.id, chatId), eq(chat.organizationId, organizationId)));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
  organizationId,
}: {
  chatId: string;
  title: string;
  organizationId: string;
}) {
  try {
    return await db
      .update(chat)
      .set({ title })
      .where(and(eq(chat.id, chatId), eq(chat.organizationId, organizationId)));
  } catch (error) {
    console.warn("Failed to update title for chat", chatId, error);
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
  organizationId,
}: {
  streamId: string;
  chatId: string;
  organizationId: string;
}) {
  try {
    const [tenantChat] = await db
      .select({ id: chat.id })
      .from(chat)
      .where(and(eq(chat.id, chatId), eq(chat.organizationId, organizationId)));
    if (!tenantChat) {
      throw new ChatbotError("not_found:chat");
    }

    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({
  chatId,
  organizationId,
}: {
  chatId: string;
  organizationId: string;
}) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .innerJoin(chat, eq(stream.chatId, chat.id))
      .where(
        and(eq(stream.chatId, chatId), eq(chat.organizationId, organizationId))
      )
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

export async function getAdminOverview(organizationId: string) {
  const [[members], [chats], [messages], billing] = await Promise.all([
    db
      .select({ value: count() })
      .from(organizationMember)
      .where(eq(organizationMember.organizationId, organizationId)),
    db
      .select({ value: count() })
      .from(chat)
      .where(eq(chat.organizationId, organizationId)),
    db
      .select({ value: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(eq(chat.organizationId, organizationId)),
    getWorkspaceBilling(organizationId),
  ]);

  return {
    users: members?.value ?? 0,
    chats: chats?.value ?? 0,
    messages: messages?.value ?? 0,
    subscription: billing.subscription
      ? {
          plan: billing.subscription.plan,
          status: billing.subscription.status,
          periodEnd: billing.subscription.periodEnd,
        }
      : null,
    monthlyMessages: billing.usage.messages,
  };
}

export async function getAdminUsers({
  organizationId,
  limit,
  offset,
}: {
  organizationId: string;
  limit: number;
  offset: number;
}) {
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      role: organizationMember.role,
      joinedAt: organizationMember.createdAt,
    })
    .from(organizationMember)
    .innerJoin(user, eq(organizationMember.userId, user.id))
    .where(eq(organizationMember.organizationId, organizationId))
    .orderBy(asc(organizationMember.createdAt), asc(user.id))
    .limit(limit + 1)
    .offset(offset);

  return { users: rows.slice(0, limit), hasMore: rows.length > limit };
}

export function getAdminRecentActivity({
  organizationId,
  limit,
}: {
  organizationId: string;
  limit: number;
}) {
  return db
    .select({
      id: usageEvent.id,
      event: usageEvent.event,
      quantity: usageEvent.quantity,
      createdAt: usageEvent.createdAt,
    })
    .from(usageEvent)
    .where(eq(usageEvent.organizationId, organizationId))
    .orderBy(desc(usageEvent.createdAt))
    .limit(limit);
}

export async function getGoogleDriveConnection(organizationId: string) {
  const [connection] = await db
    .select({
      connectionId: googleDriveConnection.connectionId,
      encryptedTokens: googleDriveConnection.encryptedTokens,
    })
    .from(googleDriveConnection)
    .where(eq(googleDriveConnection.organizationId, organizationId))
    .limit(1);
  return connection ?? null;
}

export function saveGoogleDriveConnection({
  organizationId,
  connectionId,
  encryptedTokens,
}: {
  organizationId: string;
  connectionId: string;
  encryptedTokens: string;
}) {
  return db
    .insert(googleDriveConnection)
    .values({ organizationId, connectionId, encryptedTokens })
    .onConflictDoUpdate({
      target: googleDriveConnection.organizationId,
      set: { connectionId, encryptedTokens, updatedAt: new Date() },
    });
}

export async function updateGoogleDriveConnectionIfUnchanged({
  organizationId,
  connectionId,
  previousEncryptedTokens,
  encryptedTokens,
}: {
  organizationId: string;
  connectionId: string;
  previousEncryptedTokens: string;
  encryptedTokens: string;
}) {
  const updated = await db
    .update(googleDriveConnection)
    .set({ encryptedTokens, updatedAt: new Date() })
    .where(
      and(
        eq(googleDriveConnection.organizationId, organizationId),
        eq(googleDriveConnection.connectionId, connectionId),
        eq(googleDriveConnection.encryptedTokens, previousEncryptedTokens)
      )
    )
    .returning({ organizationId: googleDriveConnection.organizationId });
  return updated.length > 0;
}

export async function deleteGoogleDriveConnectionIfUnchanged({
  organizationId,
  connectionId,
}: {
  organizationId: string;
  connectionId: string;
}) {
  const deleted = await db
    .delete(googleDriveConnection)
    .where(
      and(
        eq(googleDriveConnection.organizationId, organizationId),
        eq(googleDriveConnection.connectionId, connectionId)
      )
    )
    .returning({ organizationId: googleDriveConnection.organizationId });
  return deleted.length > 0;
}

/*
 * Growth traffic connector (GA4 + Search Console).
 *
 * Uses the multi-provider OAuthConnection table so a workspace can hold the
 * Google Drive grant and the growth grant side by side: the primary key is
 * (organizationId, provider), and Google Drive keeps its own legacy table.
 * Only ciphertext is ever written by callers; nothing here knows how to decrypt.
 */
export async function getGrowthOAuthConnection(organizationId: string) {
  const [row] = await db
    .select({
      encryptedTokens: oauthConnection.encryptedTokens,
      scopes: oauthConnection.scopes,
      accountName: oauthConnection.accountName,
      tokenExpiresAt: oauthConnection.tokenExpiresAt,
      updatedAt: oauthConnection.updatedAt,
    })
    .from(oauthConnection)
    .where(
      and(
        eq(oauthConnection.organizationId, organizationId),
        eq(oauthConnection.provider, "google_growth")
      )
    )
    .limit(1);
  return row ?? null;
}

export function saveGrowthOAuthConnection({
  organizationId,
  encryptedTokens,
  scopes,
  accountName,
  tokenExpiresAt,
}: {
  organizationId: string;
  encryptedTokens: string;
  scopes: string;
  accountName: string | null;
  tokenExpiresAt: Date;
}) {
  return db
    .insert(oauthConnection)
    .values({
      organizationId,
      provider: "google_growth",
      encryptedTokens,
      scopes,
      accountName,
      tokenExpiresAt,
    })
    .onConflictDoUpdate({
      target: [oauthConnection.organizationId, oauthConnection.provider],
      set: {
        encryptedTokens,
        scopes,
        accountName,
        tokenExpiresAt,
        updatedAt: new Date(),
      },
    });
}

/**
 * Compare-and-set so two concurrent refreshes cannot leave the row holding a
 * token that was already replaced. Returns false when the caller lost the race.
 */
export async function updateGrowthOAuthConnectionIfUnchanged({
  organizationId,
  previousEncryptedTokens,
  encryptedTokens,
  tokenExpiresAt,
}: {
  organizationId: string;
  previousEncryptedTokens: string;
  encryptedTokens: string;
  tokenExpiresAt: Date;
}) {
  const updated = await db
    .update(oauthConnection)
    .set({ encryptedTokens, tokenExpiresAt, updatedAt: new Date() })
    .where(
      and(
        eq(oauthConnection.organizationId, organizationId),
        eq(oauthConnection.provider, "google_growth"),
        eq(oauthConnection.encryptedTokens, previousEncryptedTokens)
      )
    )
    .returning({ organizationId: oauthConnection.organizationId });
  return updated.length > 0;
}

export async function deleteGrowthOAuthConnection({
  organizationId,
  previousEncryptedTokens,
}: {
  organizationId: string;
  /** When given, only delete if the stored ciphertext is still the one we read. */
  previousEncryptedTokens?: string;
}) {
  const conditions = [
    eq(oauthConnection.organizationId, organizationId),
    eq(oauthConnection.provider, "google_growth"),
  ];
  if (previousEncryptedTokens) {
    conditions.push(eq(oauthConnection.encryptedTokens, previousEncryptedTokens));
  }
  const deleted = await db
    .delete(oauthConnection)
    .where(and(...conditions))
    .returning({ organizationId: oauthConnection.organizationId });
  return deleted.length > 0;
}



export async function createPasswordResetToken(userId: string, tokenHash: string) {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  // Bootstrap-only table (0052): issued before any session exists.
  await adminDb().insert(passwordResetToken).values({ tokenHash, userId, expiresAt });
}

/**
 * Consumes a reset token exactly once.
 *
 * The old version read the row, checked it, then wrote: two submissions arriving
 * together both passed the check, so one token could reset the password twice.
 * The claim is now a single conditional UPDATE (claimPasswordResetToken) that
 * returns the userId only to the caller that won, and the password is written for
 * that winner alone.
 */
export async function consumePasswordResetToken(
  tokenHash: string,
  newPassword: string
): Promise<boolean> {
  const userId = await claimPasswordResetToken(tokenHash, { db });
  if (!userId) {
    return false;
  }

  await db
    .update(user)
    .set({ password: generateHashedPassword(newPassword) })
    .where(eq(user.id, userId));

  // Any other unused link for this account dies with the password it was meant
  // to replace, so an older email cannot be replayed after a successful reset.
  await adminDb()
    .update(passwordResetToken)
    .set({ usedAt: new Date() })
    .where(
      and(eq(passwordResetToken.userId, userId), isNull(passwordResetToken.usedAt))
    );

  return true;
}

export async function getWorkspaceUsageDetail(
  organizationId: string,
  limit = 25
) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const breakdown = await db
    .select({
      event: usageEvent.event,
      total: sum(usageEvent.quantity),
      entries: count(),
    })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.organizationId, organizationId),
        gte(usageEvent.createdAt, monthStart)
      )
    )
    .groupBy(usageEvent.event)
    .orderBy(desc(sum(usageEvent.quantity)));

  const recent = await db
    .select({
      id: usageEvent.id,
      event: usageEvent.event,
      quantity: usageEvent.quantity,
      createdAt: usageEvent.createdAt,
    })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.organizationId, organizationId),
        gte(usageEvent.createdAt, monthStart)
      )
    )
    .orderBy(desc(usageEvent.createdAt))
    .limit(limit);

  return {
    monthStart,
    breakdown: breakdown.map((row) => ({
      event: row.event,
      total: Number(row.total ?? 0),
      entries: Number(row.entries ?? 0),
    })),
    recent,
  };
}

export async function createMediaJob({
  organizationId,
  actionType,
  prompt,
}: {
  organizationId: string;
  actionType: string;
  prompt: string;
}) {
  const [row] = await db
    .insert(mediaJob)
    .values({ organizationId, actionType, prompt })
    .returning();
  return row;
}

export async function getMediaJob(id: string, organizationId: string) {
  const [row] = await db
    .select()
    .from(mediaJob)
    .where(and(eq(mediaJob.id, id), eq(mediaJob.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function finishMediaJob(input: MediaJobUpdate) {
  const [row] = await db.execute(mediaJobUpdateQuery(input));
  return row ?? null;
}

/** Owner-only image pilot: failures count toward the daily attempt cap. */
export async function reserveGatewayImage(input: {
  organizationId: string;
  actionType: "IMAGE" | "CARTOON";
  prompt: string;
}) {
  return db.transaction(async (tx) => {
    // Serialize admission across instances before counting or creating jobs.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`gateway-image:${input.organizationId}`}))`
    );
    const [usage] = await tx
      .select({ total: count() })
      .from(mediaJob)
      .where(
        and(
          eq(mediaJob.organizationId, input.organizationId),
          inArray(mediaJob.actionType, ["IMAGE", "CARTOON"]),
          sql`${mediaJob.createdAt} >= (now() at time zone 'UTC')::date`
        )
      );
    if (Number(usage?.total ?? 0) >= 3) {
      return null;
    }
    const [job] = await tx.insert(mediaJob).values(input).returning();
    return job;
  });
}

/**
 * Free-provider image admission: one job row per attempt, counted per UTC day.
 * A separate action type keeps it from eating the owner-only gateway pilot's cap.
 */
export async function reserveFreeImage(input: {
  organizationId: string;
  prompt: string;
  dailyLimit: number;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`free-image:${input.organizationId}`}))`
    );
    const [usage] = await tx
      .select({ total: count() })
      .from(mediaJob)
      .where(
        and(
          eq(mediaJob.organizationId, input.organizationId),
          eq(mediaJob.actionType, "FREE_IMAGE"),
          sql`${mediaJob.createdAt} >= (now() at time zone 'UTC')::date`
        )
      );
    const used = Number(usage?.total ?? 0);
    if (used >= input.dailyLimit) {
      return { job: null, used };
    }
    const [job] = await tx
      .insert(mediaJob)
      .values({
        organizationId: input.organizationId,
        actionType: "FREE_IMAGE",
        prompt: input.prompt,
        status: "running",
      })
      .returning();
    return { job, used: used + 1 };
  });
}

export async function getAgentHistory(
  organizationId: string,
  conversationKey: string,
  limit = 10
) {
  const rows = await db
    .select({
      role: agentMessage.role,
      content: agentMessage.content,
    })
    .from(agentMessage)
    .where(
      and(
        eq(agentMessage.organizationId, organizationId),
        eq(agentMessage.conversationKey, conversationKey)
      )
    )
    .orderBy(desc(agentMessage.createdAt))
    .limit(limit);

  return rows.reverse();
}

export async function appendAgentMessage({
  organizationId,
  userId,
  conversationKey,
  role,
  content,
}: {
  organizationId: string;
  userId: string;
  conversationKey: string;
  role: "user" | "assistant";
  content: string;
}) {
  await db.insert(agentMessage).values({
    organizationId,
    userId,
    conversationKey,
    role,
    content: content.slice(0, 8000),
  });
}

/** Email of one account, used to match the owner testing allowlist. */
export async function getUserEmailById(userId: string) {
  const [row] = await adminDb()
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? null;
}

/** Owner of a workspace, used by the launch testing program to resolve a claim. */
export async function getWorkspaceOwnerId(organizationId: string) {
  const [row] = await adminDb()
    .select({ userId: organizationMember.userId })
    .from(organizationMember)
    .where(eq(organizationMember.organizationId, organizationId))
    .limit(1);
  return row?.userId ?? null;
}
