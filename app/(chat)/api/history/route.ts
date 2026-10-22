import type { NextRequest } from "next/server";
import {
  getWorkspaceContext,
  requireWorkspaceRole,
} from "@/lib/auth/workspace";
import {
  deleteAllChatsByOrganizationId,
  getChatsByOrganizationId,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const limit = Number.parseInt(searchParams.get("limit") || "10", 10);
  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");

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

export async function DELETE() {
  const workspaceContext = await requireWorkspaceRole("admin");

  if (!workspaceContext) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const result = await deleteAllChatsByOrganizationId({
    organizationId: workspaceContext.organizationId,
  });

  return Response.json(result, { status: 200 });
}
