import type { ArtifactKind } from "@/components/artifact";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  deleteDocumentsByIdAfterTimestamp,
  getDocumentsById,
  saveDocument,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { optionalIntIsValid, queryParamIsValid, uuidSchema } from "@/lib/validation/chat";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const idValid = queryParamIsValid(id, uuidSchema, "id", "must be a valid document id");
  if (!idValid.ok) {
    return idValid.response;
  }

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

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const idValid = queryParamIsValid(id, uuidSchema, "id", "must be a valid document id");
  if (!idValid.ok) {
    return idValid.response;
  }

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

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const idValid = queryParamIsValid(id, uuidSchema, "id", "must be a valid document id");
  if (!idValid.ok) {
    return idValid.response;
  }
  const timestamp = searchParams.get("timestamp");
  const timestampValid = optionalIntIsValid(timestamp, "timestamp");
  if (!timestampValid.ok) {
    return timestampValid.response;
  }

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
