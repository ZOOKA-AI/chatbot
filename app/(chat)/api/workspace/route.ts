import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { updateWorkspaceName } from "@/lib/db/queries";
import { WORKSPACE_NAME_MAX, WORKSPACE_NAME_MIN } from "@/lib/workspace-name";

const renameSchema = z.object({
  name: z.string().trim().min(WORKSPACE_NAME_MIN).max(WORKSPACE_NAME_MAX),
});

export async function PATCH(request: Request) {
  const context = await requireWorkspaceRole("admin");
  if (!context) {
    return NextResponse.json(
      { error: "Workspace admin access required" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: `Name must be between ${WORKSPACE_NAME_MIN} and ${WORKSPACE_NAME_MAX} characters`,
      },
      { status: 400 }
    );
  }

  await updateWorkspaceName({
    organizationId: context.organizationId,
    name: parsed.data.name,
  });

  return NextResponse.json({ name: parsed.data.name });
}
