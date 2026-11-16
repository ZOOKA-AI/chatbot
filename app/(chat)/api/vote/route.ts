import { getWorkspaceContext } from "@/lib/auth/workspace";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import { getChatById, getVotesByChatId, voteMessage } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { queryParamIsValid, uuidSchema } from "@/lib/validation/chat";
import { z } from "zod";

async function GETImpl(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");
  const chatIdValid = queryParamIsValid(chatId, uuidSchema, "chatId", "must be a valid chat id");
  if (!chatIdValid.ok) {
    return chatIdValid.response;
  }

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

const voteBodySchema = z
  .object({
    chatId: uuidSchema,
    messageId: uuidSchema,
    type: z.enum(["up", "down"]),
  })
  .strict();

async function PATCHImpl(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new ChatbotError("bad_request:api", "Body must be JSON").toResponse();
  }

  const parsedBody = voteBodySchema.safeParse(raw);
  if (!parsedBody.success) {
    // Same reason string the endpoint always used, so clients keep working.
    return new ChatbotError(
      "bad_request:api",
      "Parameters chatId, messageId, and type are required."
    ).toResponse();
  }
  const { chatId, messageId, type } = parsedBody.data;

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

// Tenant-scoped wrappers: query work runs inside the caller's tenant transaction.
export const GET = withRequestTenantHandler(GETImpl);
export const PATCH = withRequestTenantHandler(PATCHImpl);
