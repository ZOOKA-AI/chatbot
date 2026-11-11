import postgres from "postgres";

/**
 * مشاريع العملاء (PaaS): كل صف يمثل موقعاً معزولاً تحت مظلة Zooka.
 * الجدول يُنشأ تلقائياً عند أول استخدام حتى لا يعتمد النشر على تشغيل هجرة يدوية.
 */

let client: ReturnType<typeof postgres> | null = null;

function sql() {
  if (client) {
    return client;
  }
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is not configured");
  }
  client = postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  return client;
}

let schemaReady = false;

export async function ensureProjectTable() {
  if (schemaReady) {
    return;
  }
  const q = sql();
  await q`
    CREATE TABLE IF NOT EXISTS "Project" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "organizationId" uuid NOT NULL,
      "createdBy" uuid,
      "name" text NOT NULL,
      "subdomain" varchar(63) NOT NULL,
      "customDomain" varchar(253),
      "status" varchar(16) NOT NULL DEFAULT 'CREATING',
      "templateId" text,
      "templateConfig" jsonb,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )`;
  await q`CREATE UNIQUE INDEX IF NOT EXISTS "Project_subdomain_unique" ON "Project" ("subdomain")`;
  await q`CREATE UNIQUE INDEX IF NOT EXISTS "Project_customDomain_unique" ON "Project" ("customDomain") WHERE "customDomain" IS NOT NULL`;
  await q`CREATE INDEX IF NOT EXISTS "Project_organizationId_idx" ON "Project" ("organizationId")`;
  schemaReady = true;
}

export type ProjectRow = {
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
};

export async function listProjects(organizationId: string) {
  await ensureProjectTable();
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
  await ensureProjectTable();
  const q = sql();
  const rows = await q<ProjectRow[]>`
    INSERT INTO "Project" ("organizationId", "createdBy", "name", "subdomain", "status", "templateId")
    VALUES (${input.organizationId}, ${input.createdBy}, ${input.name}, ${input.subdomain},
            'CREATING', ${input.templateId})
    RETURNING "id", "organizationId", "createdBy", "name", "subdomain",
              "customDomain", "status", "templateId", "createdAt", "updatedAt"`;
  return rows[0];
}

export async function attachDomain(projectId: string, customDomain: string) {
  await ensureProjectTable();
  const q = sql();
  const rows = await q<ProjectRow[]>`
    UPDATE "Project"
    SET "customDomain" = ${customDomain}, "status" = 'ACTIVE', "updatedAt" = now()
    WHERE "id" = ${projectId}
    RETURNING "id", "organizationId", "name", "subdomain", "customDomain", "status"`;
  return rows[0] ?? null;
}
