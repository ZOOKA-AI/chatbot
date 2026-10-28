import "server-only";

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
  like,
  lt,
  ne,
  or,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
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
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

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
  const [workspace] = await db
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

export async function ensureUserWorkspace({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const existingWorkspace = await getWorkspaceForUser(userId);
  if (existingWorkspace) {
    return existingWorkspace;
  }

  const [createdWorkspace] = await db
    .insert(organization)
    .values({ name: defaultWorkspaceNameForEmail(email) })
    .returning({ id: organization.id, name: organization.name });

  await db
    .insert(organizationMember)
    .values({
      organizationId: createdWorkspace.id,
      userId,
      role: "owner",
    })
    .onConflictDoNothing();
  await db
    .insert(subscription)
    .values({ organizationId: createdWorkspace.id })
    .onConflictDoNothing();

  return (
    (await getWorkspaceForUser(userId)) ?? {
      ...createdWorkspace,
      role: "owner" as const,
    }
  );
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
  return db
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
  return db
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
    await db
      .delete(guestUsage)
      .where(
        and(like(guestUsage.key, "ip:%"), lt(guestUsage.updatedAt, cutoff))
      );
  } catch {
    // Pruning is best-effort; never block the request on it.
  }

  const [row] = await db
    .insert(guestUsage)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: guestUsage.key,
      set: { count: sql`${guestUsage.count} + 1`, updatedAt: new Date() },
    })
    .returning({ count: guestUsage.count });
  return row.count;
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
    return await db.select().from(user).where(eq(user.email, email));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create user");
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
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      organizationId,
      title,
      visibility,
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
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

    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(and(eq(chat.id, id), eq(chat.organizationId, organizationId)))
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
    const visibleToUser = or(
      eq(chat.userId, userId),
      eq(chat.visibility, "public")
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
        .orderBy(desc(chat.createdAt))
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

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
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

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
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
  try {
    const chatIds = [...new Set(messages.map(({ chatId }) => chatId))];
    if (chatIds.length === 0) {
      return;
    }

    const tenantChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(
        and(inArray(chat.id, chatIds), eq(chat.organizationId, organizationId))
      );
    if (tenantChats.length !== chatIds.length) {
      throw new ChatbotError("forbidden:chat");
    }

    return await db.insert(message).values(messages);
  } catch (_error) {
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
