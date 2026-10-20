import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getChatById, getVotesByChatId, voteMessage } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter chatId is required."
    ).toResponse();
  }

  const context = await getWorkspaceContext();

  if (!context) {
    return new ChatbotError("unauthorized:vote").toResponse();
  }

  const chat = await getChatById({
    id: chatId,
    organizationId: context.organizationId,
  });

  if (!chat) {
    return new ChatbotError("not_found:chat").toResponse();
  }

  if (chat.userId !== context.user.id) {
    return new ChatbotError("forbidden:vote").toResponse();
  }

  const votes = await getVotesByChatId({
    id: chatId,
    organizationId: context.organizationId,
  });

  return Response.json(votes, { status: 200 });
}

export async function PATCH(request: Request) {
  const {
    chatId,
    messageId,
    type,
  }: { chatId: string; messageId: string; type: "up" | "down" } =
    await request.json();

  if (!chatId || !messageId || !type) {
    return new ChatbotError(
      "bad_request:api",
      "Parameters chatId, messageId, and type are required."
    ).toResponse();
  }

  const context = await getWorkspaceContext();

  if (!context) {
    return new ChatbotError("unauthorized:vote").toResponse();
  }

  const chat = await getChatById({
    id: chatId,
    organizationId: context.organizationId,
  });

  if (!chat) {
    return new ChatbotError("not_found:vote").toResponse();
  }

  if (chat.userId !== context.user.id) {
    return new ChatbotError("forbidden:vote").toResponse();
  }

  await voteMessage({
    chatId,
    messageId,
    type,
    organizationId: context.organizationId,
  });

  return new Response("Message voted", { status: 200 });
}
