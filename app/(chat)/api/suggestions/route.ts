import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getSuggestionsByDocumentId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");

  if (!documentId) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter documentId is required."
    ).toResponse();
  }

  const context = await getWorkspaceContext();

  if (!context) {
    return new ChatbotError("unauthorized:suggestions").toResponse();
  }

  const suggestions = await getSuggestionsByDocumentId({
    documentId,
    organizationId: context.organizationId,
  });

  const [suggestion] = suggestions;

  if (!suggestion) {
    return Response.json([], { status: 200 });
  }

  return Response.json(suggestions, { status: 200 });
}
