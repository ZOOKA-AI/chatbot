import { redirect } from "next/navigation";

import { LaunchConsole } from "@/components/launch-console";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export default async function WorkspaceLaunchPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const canManage = ["owner", "admin"].includes(String(context.role));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-lg font-semibold">Business launch</h1>
        <p className="text-sm opacity-70">
          A plan states what will be done, what needs your approval, and what only you can do. Nothing is marked completed
          until it actually ran.
        </p>
      </header>
      <LaunchConsole canManage={canManage} />
    </main>
  );
}
