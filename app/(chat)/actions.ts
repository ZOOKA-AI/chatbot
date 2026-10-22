"use server";

import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";
import type { VisibilityType } from "@/components/visibility-selector";
import { titlePrompt } from "@/lib/ai/prompts";
import { getTitleModel } from "@/lib/ai/providers";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
  updateChatVisibilityById,
} from "@/lib/db/queries";
import { getTextFromMessage } from "@/lib/utils";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text } = await generateText({
    model: getTitleModel(),
    system: titlePrompt,
    prompt: getTextFromMessage(message),
  });
  return text
    .replace(/^[#*"\s]+/, "")
    .replace(/["]+$/, "")
    .trim();
}

export async function deleteTrailingMessages({ id }: { id: string }) {
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

export async function updateChatVisibility({
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
