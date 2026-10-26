"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspaceRole } from "@/lib/auth/workspace";
import {
  addWorkspaceMember,
  createWorkspaceInvitation,
  getUser,
  getWorkspaceForUser,
  updateWorkspaceMemberRole,
  updateWorkspaceName,
} from "@/lib/db/queries";
import { WORKSPACE_NAME_MAX, WORKSPACE_NAME_MIN } from "@/lib/workspace-name";

const workspaceNameSchema = z
  .string()
  .trim()
  .min(WORKSPACE_NAME_MIN)
  .max(WORKSPACE_NAME_MAX);
const invitationSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["admin", "member"]),
});

export async function renameWorkspace(formData: FormData) {
  const context = await requireWorkspaceRole("admin");
  const name = workspaceNameSchema.safeParse(formData.get("name"));

  if (!context || !name.success) {
    return;
  }

  await updateWorkspaceName({
    organizationId: context.organizationId,
    name: name.data,
  });
  revalidatePath("/workspace");
}

export async function inviteWorkspaceMember(formData: FormData) {
  const context = await requireWorkspaceRole("admin");
  const invitation = invitationSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!context || !invitation.success) {
    return;
  }

  const [existingUser] = await getUser(invitation.data.email);
  if (existingUser) {
    await addWorkspaceMember({
      organizationId: context.organizationId,
      userId: existingUser.id,
      role: invitation.data.role,
    });
    revalidatePath("/workspace");
    return;
  }

  await createWorkspaceInvitation({
    organizationId: context.organizationId,
    invitedBy: context.user.id,
    ...invitation.data,
  });
  revalidatePath("/workspace");
}

export async function switchWorkspace(formData: FormData) {
  const context = await requireWorkspaceRole("member");
  const organizationId = formData.get("organizationId");
  if (!context || typeof organizationId !== "string") {
    return;
  }

  const workspace = await getWorkspaceForUser(context.user.id, organizationId);
  if (!workspace) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set("active-workspace", workspace.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/workspace");
}

export async function changeWorkspaceMemberRole(formData: FormData) {
  const context = await requireWorkspaceRole("admin");
  const userId = formData.get("userId");
  const role = formData.get("role");

  if (
    !context ||
    typeof userId !== "string" ||
    (role !== "admin" && role !== "member")
  ) {
    return;
  }

  await updateWorkspaceMemberRole({
    organizationId: context.organizationId,
    userId,
    role,
  });
  revalidatePath("/workspace");
}
