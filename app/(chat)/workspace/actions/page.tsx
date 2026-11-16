import { redirect } from "next/navigation";

import { ActionCatalogConsole } from "@/components/action-catalog-console";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export default async function WorkspaceActionsPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const canManage = ["owner", "admin"].includes(String(context.role));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-lg font-semibold">Actions</h1>
        <p className="text-sm opacity-70">
          Each action is a declared contract: the inputs it needs, the agent role that takes it, the tool it
          runs, and what it produces. Running one creates a real task; the state shown is the task&apos;s state.
        </p>
      </header>
      <ActionCatalogConsole canManage={canManage} />
    </main>
  );
}
