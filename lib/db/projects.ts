import postgres from "postgres";

/**
 * مشاريع العملاء (PaaS): كل صف يمثل موقعاً معزولاً تحت مظلة Zooka.
 * Schema changes are reviewed migrations, never request-time DDL.
 */

let client: ReturnType<typeof postgres> | null = null;

function sql() {
  if (client) {
    return client;
  }
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is not configured");
  }
  client = postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  return client;
}

export interface ProjectRow {
  id: string;
  organizationId: string;
  createdBy: string | null;
  name: string;
  subdomain: string;
  customDomain: string | null;
  status: string;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listProjects(organizationId: string) {
  const q = sql();
  return await q<ProjectRow[]>`
    SELECT "id", "organizationId", "createdBy", "name", "subdomain",
           "customDomain", "status", "templateId", "createdAt", "updatedAt"
    FROM "Project"
    WHERE "organizationId" = ${organizationId}
    ORDER BY "createdAt" DESC`;
}

export async function createProject(input: {
  organizationId: string;
  createdBy: string | null;
  name: string;
  subdomain: string;
  templateId: string | null;
}) {
  const q = sql();
  const rows = await q<ProjectRow[]>`
    INSERT INTO "Project" ("organizationId", "createdBy", "name", "subdomain", "status", "templateId")
    VALUES (${input.organizationId}, ${input.createdBy}, ${input.name}, ${input.subdomain},
            'CREATING', ${input.templateId})
    RETURNING "id", "organizationId", "createdBy", "name", "subdomain",
              "customDomain", "status", "templateId", "createdAt", "updatedAt"`;
  return rows[0];
}

export async function attachDomain(
  projectId: string,
  organizationId: string,
  customDomain: string
) {
  const q = sql();
  const rows = await q<ProjectRow[]>`
    UPDATE "Project"
    SET "customDomain" = ${customDomain}, "updatedAt" = now()
    WHERE "id" = ${projectId} AND "organizationId" = ${organizationId}
    RETURNING "id", "organizationId", "name", "subdomain", "customDomain", "status"`;
  return rows[0] ?? null;
}
