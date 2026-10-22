import Link from "next/link";
import { redirect } from "next/navigation";
import {
  changeWorkspaceMemberRole,
  inviteWorkspaceMember,
  renameWorkspace,
  switchWorkspace,
} from "@/app/(chat)/workspace/actions";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import {
  getWorkspaceInvitations,
  getWorkspaceMembers,
  getWorkspacesForUser,
} from "@/lib/db/queries";

export default async function WorkspacePage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const [members, invitations, workspaces] = await Promise.all([
    getWorkspaceMembers(context.organizationId),
    getWorkspaceInvitations(context.organizationId),
    getWorkspacesForUser(context.user.id),
  ]);
  const canManage = context.role === "owner" || context.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">Current workspace</p>
          <h1 className="font-semibold text-2xl">{context.workspace.name}</h1>
        </div>
        <Link className="text-sm underline" href="/workspace/billing">
          Plan and usage
        </Link>
      </header>

      {workspaces.length > 1 && (
        <form action={switchWorkspace} className="flex items-center gap-3">
          <label className="text-sm" htmlFor="organizationId">
            Switch workspace
          </label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            defaultValue={context.organizationId}
            id="organizationId"
            name="organizationId"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <button className="rounded-md border px-3 py-2 text-sm" type="submit">
            Switch
          </button>
        </form>
      )}

      <section className="flex flex-col gap-4 rounded-lg border p-5">
        <h2 className="font-medium text-lg">Workspace settings</h2>
        {canManage ? (
          <form action={renameWorkspace} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm" htmlFor="name">
              Workspace name
              <input
                className="rounded-md border bg-background px-3 py-2"
                defaultValue={context.workspace.name}
                id="name"
                maxLength={80}
                minLength={2}
                name="name"
                required
              />
            </label>
            <button
              className="w-fit rounded-md border px-3 py-2 text-sm"
              type="submit"
            >
              Save name
            </button>
          </form>
        ) : (
          <p className="text-sm">{context.workspace.name}</p>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-lg border p-5">
        <h2 className="font-medium text-lg">Members ({members.length})</h2>
        <ul className="flex flex-col divide-y">
          {members.map((member) => (
            <li
              className="flex items-center justify-between gap-4 py-3 text-sm"
              key={member.userId}
            >
              <span>{member.email}</span>
              {canManage && member.role !== "owner" ? (
                <form action={changeWorkspaceMemberRole} className="flex gap-2">
                  <input name="userId" type="hidden" value={member.userId} />
                  <select
                    aria-label={`Role for ${member.email}`}
                    className="rounded-md border bg-background px-2 py-1"
                    defaultValue={member.role}
                    name="role"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="rounded-md border px-2 py-1" type="submit">
                    Update
                  </button>
                </form>
              ) : (
                <span className="capitalize text-muted-foreground">
                  {member.role}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section className="flex flex-col gap-4 rounded-lg border p-5">
          <h2 className="font-medium text-lg">Invite a member</h2>
          <form action={inviteWorkspaceMember} className="flex flex-wrap gap-3">
            <input
              className="min-w-52 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              name="email"
              placeholder="name@example.com"
              required
              type="email"
            />
            <select
              aria-label="Invitation role"
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue="member"
              name="role"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              type="submit"
            >
              Create invitation
            </button>
          </form>
          <p className="text-muted-foreground text-xs">
            Invitations are recorded for seven days. Email delivery and
            self-service acceptance are not enabled yet.
          </p>
          {invitations.length > 0 && (
            <ul className="flex flex-col divide-y text-sm">
              {invitations.map((invitation) => (
                <li
                  className="flex justify-between gap-3 py-2"
                  key={invitation.id}
                >
                  <span>{invitation.email}</span>
                  <span className="capitalize text-muted-foreground">
                    {invitation.acceptedAt
                      ? "Accepted"
                      : invitation.expiresAt < new Date()
                        ? "Expired"
                        : `Pending · ${invitation.role}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
