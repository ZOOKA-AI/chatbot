import "server-only";

import { cookies } from "next/headers";
import type { OrganizationRole } from "@/app/(auth)/auth";
import { auth } from "@/app/(auth)/auth";
import { getWorkspaceForUser } from "@/lib/db/queries";

const rolePriority: Record<OrganizationRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

export async function getWorkspaceContext() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const cookieStore = await cookies();
  const selectedWorkspaceId = cookieStore.get("active-workspace")?.value;
  const workspace =
    (selectedWorkspaceId
      ? await getWorkspaceForUser(session.user.id, selectedWorkspaceId)
      : null) ?? (await getWorkspaceForUser(session.user.id));
  if (!workspace) {
    return null;
  }

  const user = {
    ...session.user,
    organizationId: workspace.id,
    organizationRole: workspace.role as OrganizationRole,
  };
  const scopedSession = { ...session, user };

  return {
    session: scopedSession,
    user,
    workspace,
    organizationId: workspace.id,
    role: workspace.role as OrganizationRole,
  };
}

export async function requireWorkspaceRole(minimumRole: OrganizationRole) {
  const context = await getWorkspaceContext();
  if (!context || rolePriority[context.role] < rolePriority[minimumRole]) {
    return null;
  }

  return context;
}
