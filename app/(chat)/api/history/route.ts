import type { NextRequest } from "next/server";
import { withRequestTenantHandler } from "@/lib/db/request-tenant";
import {
  getWorkspaceContext,
  requireWorkspaceRole,
} from "@/lib/auth/workspace";
import {
  deleteAllChatsByOrganizationId,
  getChatsByOrganizationId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { CHAT_HISTORY_PAGE_SIZE, historyLimitSchema } from "@/lib/chat-history";
import { cursorSchema } from "@/lib/validation/chat";

async function GETImpl(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // "abc" used to become NaN and reach the query builder; a repeated or huge
  // cursor is refused here instead of being handed to the database.
  const limitRaw = searchParams.get("limit");
  const limitParsed = historyLimitSchema.safeParse(limitRaw === null || limitRaw === "" ? 10 : limitRaw);
  if (!limitParsed.success) {
    return new ChatbotError(
      "bad_request:api",
      `Parameter limit must be a whole number between 1 and ${CHAT_HISTORY_PAGE_SIZE}`
    ).toResponse();
  }
  const limit = limitParsed.data;

  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");
  for (const [name, value] of [
    ["starting_after", startingAfter],
    ["ending_before", endingBefore],
  ] as const) {
    if (value !== null && value !== "" && !cursorSchema.safeParse(value).success) {
      return new ChatbotError(
        "bad_request:api",
        `Parameter ${name} must be between 1 and 64 characters`
      ).toResponse();
    }
  }

  if (startingAfter && endingBefore) {
    return new ChatbotError(
      "bad_request:api",
      "Only one of starting_after or ending_before can be provided."
    ).toResponse();
  }

  const workspaceContext = await getWorkspaceContext();

  if (!workspaceContext) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chats = await getChatsByOrganizationId({
    organizationId: workspaceContext.organizationId,
    userId: workspaceContext.user.id,
    limit,
    startingAfter,
    endingBefore,
  });

  return Response.json(chats);
}

async function DELETEImpl() {
  const workspaceContext = await requireWorkspaceRole("admin");

  if (!workspaceContext) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const result = await deleteAllChatsByOrganizationId({
    organizationId: workspaceContext.organizationId,
  });

  return Response.json(result, { status: 200 });
}

// Tenant-scoped wrappers: query work runs inside the caller's tenant transaction.
export const GET = withRequestTenantHandler(GETImpl);
export const DELETE = withRequestTenantHandler(DELETEImpl);
