"use server";

import { withRequestTenantAction } from "@/lib/db/request-tenant";
import { cookies } from "next/headers";
import type { VisibilityType } from "@/components/visibility-selector";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
  updateChatVisibilityById,
} from "@/lib/db/queries";

async function saveChatModelAsCookieImpl(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

async function deleteTrailingMessagesImpl({ id }: { id: string }) {
  const context = await getWorkspaceContext();
  if (!context) {
    return;
  }

  const [message] = await getMessageById({
    id,
    organizationId: context.organizationId,
    userId: context.user.id,
  });
  if (!message) {
    return;
  }

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
    organizationId: context.organizationId,
  });
}

async function updateChatVisibilityImpl({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  const context = await getWorkspaceContext();
  if (!context) {
    return;
  }
  const chat = await getChatById({
    id: chatId,
    organizationId: context.organizationId,
  });
  if (!chat || chat.userId !== context.user.id) {
    return;
  }
  await updateChatVisibilityById({
    chatId,
    visibility,
    organizationId: context.organizationId,
  });
}

// Tenant-scoped actions: each mutation runs inside the caller's tenant transaction.
export const saveChatModelAsCookie = withRequestTenantAction(saveChatModelAsCookieImpl);
export const deleteTrailingMessages = withRequestTenantAction(deleteTrailingMessagesImpl);
export const updateChatVisibility = withRequestTenantAction(updateChatVisibilityImpl);
