import type { ArtifactKind } from "@/components/artifact";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  deleteDocumentsByIdAfterTimestamp,
  getDocumentsById,
  saveDocument,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { withRequestTenantHandler } from "@/lib/db/tenant";

async function GET_tenant(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter id is missing"
    ).toResponse();
  }

  const context = await getWorkspaceContext();

  if (!context) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  const documents = await getDocumentsById({
    id,
    organizationId: context.organizationId,
  });

  const [document] = documents;

  if (!document) {
    return new ChatbotError("not_found:document").toResponse();
  }

  return Response.json(documents, { status: 200 });
}

async function POST_tenant(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter id is required."
    ).toResponse();
  }

  const context = await getWorkspaceContext();

  if (!context) {
    return new ChatbotError("not_found:document").toResponse();
  }

  const {
    content,
    title,
    kind,
  }: { content: string; title: string; kind: ArtifactKind } =
    await request.json();

  const document = await saveDocument({
    id,
    content,
    title,
    kind,
    userId: context.user.id,
    organizationId: context.organizationId,
  });

  return Response.json(document, { status: 200 });
}

async function DELETE_tenant(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const timestamp = searchParams.get("timestamp");

  if (!id) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter id is required."
    ).toResponse();
  }

  if (!timestamp) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter timestamp is required."
    ).toResponse();
  }

  const context = await getWorkspaceContext();

  if (!context) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  const documents = await getDocumentsById({
    id,
    organizationId: context.organizationId,
  });

  const [document] = documents;

  if (!document) {
    return new ChatbotError("not_found:document").toResponse();
  }

  const documentsDeleted = await deleteDocumentsByIdAfterTimestamp({
    id,
    timestamp: new Date(timestamp),
    organizationId: context.organizationId,
  });

  return Response.json(documentsDeleted, { status: 200 });
}

// Tenant-scoped exports: every request runs inside a resolved tenant scope.
export const GET = withRequestTenantHandler(GET_tenant);
export const POST = withRequestTenantHandler(POST_tenant);
export const DELETE = withRequestTenantHandler(DELETE_tenant);
