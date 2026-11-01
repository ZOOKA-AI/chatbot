import { auth } from "@/app/(auth)/auth";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { db } from "@/lib/db";
import { studioProject } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await getWorkspaceContext();
  if (!context) return NextResponse.json({ projects: [] });

  const projects = await db
    .select()
    .from(studioProject)
    .where(eq(studioProject.organizationId, context.organizationId))
    .orderBy(studioProject.updatedAt);
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await getWorkspaceContext();
  if (!context) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await request.json();
  const { name, html } = body;
  if (!name || !html) return NextResponse.json({ error: "name and html required" }, { status: 400 });

  const [project] = await db
    .insert(studioProject)
    .values({
      organizationId: context.organizationId,
      name: String(name).slice(0, 200),
      html: String(html),
    })
    .returning();
  return NextResponse.json({ project });
}
