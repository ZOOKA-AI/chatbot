import { redirect } from "next/navigation";

import { ProjectConsole } from "@/components/project-console";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export default async function WorkspaceProjectsPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  // The page decides what to show; the API decides what is allowed.
  const canManage = ["owner", "admin"].includes(String(context.role));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-lg font-semibold">Projects</h1>
        <p className="text-sm opacity-70">
          A project is what work belongs to: the agents assigned to it, the tasks it produced, and the
          evidence from every execution. Removing a project keeps the work that really ran.
        </p>
      </header>
      <ProjectConsole canManage={canManage} />
    </main>
  );
}
