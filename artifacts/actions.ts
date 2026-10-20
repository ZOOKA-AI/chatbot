"use server";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getSuggestionsByDocumentId } from "@/lib/db/queries";

export async function getSuggestions({ documentId }: { documentId: string }) {
  const context = await getWorkspaceContext();
  if (!context) {
    return [];
  }
  const suggestions = await getSuggestionsByDocumentId({
    documentId,
    organizationId: context.organizationId,
  });
  return suggestions ?? [];
}
