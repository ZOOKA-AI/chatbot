import { redirect } from "next/navigation";

import { AgentManager } from "@/components/agent-manager";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getLang } from "@/lib/i18n";

export default async function WorkspaceAgentsPage() {
  const [context, lang] = await Promise.all([getWorkspaceContext(), getLang()]);
  if (!context) {
    redirect("/login");
  }

  const canManage = ["owner", "admin"].includes(String(context.role));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <header>
        <h1 className="text-lg font-semibold">Agents</h1>
        <p className="text-sm opacity-70">
          Each agent runs only the tools you assign, under the model you choose. A tool that is missing here is one the
          platform cannot execute.
        </p>
      </header>
      <AgentManager canManage={canManage} lang={lang} />
    </main>
  );
}
