import { NextResponse } from "next/server";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import { disconnectGoogleDrive } from "@/lib/integrations/google-drive/server";

export async function DELETE() {
  const context = await requireWorkspaceRole("admin");
  if (!context || context.user.type !== "regular") {
    return NextResponse.json(
      { error: "Workspace admin access required." },
      {
        status: 403,
      }
    );
  }
  const result = await disconnectGoogleDrive(context.organizationId);
  return NextResponse.json(result);
}
