import { redirect } from "next/navigation";
import { AgentCommandConsole } from "@/components/agent-command-console";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export default async function WorkspaceAgentCommandsPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <AgentCommandConsole />
    </main>
  );
}
