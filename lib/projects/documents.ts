import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import { projectDocument } from "@/lib/db/schema";

/**
 * Reading a workspace's documents.
 *
 * Every function takes the organization from the caller and puts it in the WHERE clause. A
 * document belonging to another workspace is reported as absent, not forbidden: an id that does
 * not exist and an id that is not yours must be indistinguishable from outside.
 */

export type DocumentRow = typeof projectDocument.$inferSelect;

export async function listProjectDocuments(
  organizationId: string,
  projectId: string,
  limit = 50
): Promise<Omit<DocumentRow, "body">[]> {
  return db
    .select({
      id: projectDocument.id,
      organizationId: projectDocument.organizationId,
      projectId: projectDocument.projectId,
      taskId: projectDocument.taskId,
      title: projectDocument.title,
      format: projectDocument.format,
      bytes: projectDocument.bytes,
      createdBy: projectDocument.createdBy,
      createdAt: projectDocument.createdAt,
    })
    .from(projectDocument)
    .where(and(eq(projectDocument.organizationId, organizationId), eq(projectDocument.projectId, projectId)))
    .orderBy(desc(projectDocument.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

/**
 * Every document this workspace owns, newest first.
 *
 * The index page needs a workspace-wide view, but the rule stays the same as everywhere else in
 * this file: the organization is a bound parameter, so a document from another workspace is
 * simply not in the result rather than being filtered out afterwards.
 */
export async function listWorkspaceDocuments(
  organizationId: string,
  limit = 100
): Promise<Omit<DocumentRow, "body">[]> {
  return db
    .select({
      id: projectDocument.id,
      organizationId: projectDocument.organizationId,
      projectId: projectDocument.projectId,
      taskId: projectDocument.taskId,
      title: projectDocument.title,
      format: projectDocument.format,
      bytes: projectDocument.bytes,
      createdBy: projectDocument.createdBy,
      createdAt: projectDocument.createdAt,
    })
    .from(projectDocument)
    .where(eq(projectDocument.organizationId, organizationId))
    .orderBy(desc(projectDocument.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function getDocument(input: {
  organizationId: string;
  documentId: string;
}): Promise<DocumentRow | null> {
  const [row] = await db
    .select()
    .from(projectDocument)
    .where(and(eq(projectDocument.id, input.documentId), eq(projectDocument.organizationId, input.organizationId)))
    .limit(1);
  return row ?? null;
}

/** A filename a browser will accept: keeps the title, drops anything that could break a header. */
export function documentFilename(title: string, format: string): string {
  const base = title.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-").slice(0, 80) || "document";
  return `${base}.${format === "markdown" ? "md" : "txt"}`;
}
