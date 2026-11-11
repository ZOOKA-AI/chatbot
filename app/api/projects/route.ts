import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { createProject, listProjects } from "@/lib/db/projects";

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED = new Set([
  "www", "api", "app", "admin", "dashboard", "billing", "auth", "login",
  "register", "static", "assets", "cdn", "mail", "smtp", "status", "docs",
  "blog", "support", "help", "files", "media", "preview",
]);

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  subdomain: z.string().trim().toLowerCase().regex(LABEL, "صيغة النطاق الفرعي غير صحيحة"),
  templateId: z.string().trim().max(64).optional(),
});

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }
  const projects = await listProjects(context.organizationId);
  return NextResponse.json({
    projects,
    platformDomain: process.env.PLATFORM_DOMAIN ?? "zooka-ai.com",
  });
}

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "غير مصرح بالوصول" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "بيانات غير صالحة", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, subdomain, templateId } = parsed.data;
  if (RESERVED.has(subdomain)) {
    return NextResponse.json(
      { error: "هذا النطاق الفرعي محجوز للنظام" },
      { status: 409 }
    );
  }

  try {
    const project = await createProject({
      organizationId: context.organizationId,
      createdBy: context.user.id,
      name,
      subdomain,
      templateId: templateId ?? null,
    });
    return NextResponse.json(
      {
        project,
        url: `https://${subdomain}.${process.env.PLATFORM_DOMAIN ?? "zooka-ai.com"}`,
      },
      { status: 201 }
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json(
        { error: "النطاق الفرعي مستخدم بالفعل" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "تعذر إنشاء المشروع" },
      { status: 500 }
    );
  }
}
