import { redirect } from "next/navigation";

import { CommanderConsole } from "@/components/commander/commander-console";
import {
  listAgents,
  listApprovals,
  listDecisions,
  listTaskPage,
} from "@/lib/agents/command-center";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getLang } from "@/lib/i18n";

/**
 * The Commander screen.
 *
 * Everything is read here, on the server, as the signed-in workspace: the
 * organisation comes from the session through getWorkspaceContext, never from a
 * query parameter, so a crafted URL cannot show another workspace's work.
 *
 * The page renders real rows or honest empty states. There are no sample tasks,
 * no placeholder numbers and no invented agents to make the screen look busy.
 */
export default async function CommanderPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();
  const dir = lang === "ar" ? "rtl" : "ltr";

  const [historyPage, approvals, decisions, agents] = await Promise.all([
    listTaskPage({ organizationId: context.organizationId, limit: 50 }),
    listApprovals(context.organizationId, { limit: 100 }),
    listDecisions(context.organizationId, 200),
    listAgents(context.organizationId),
  ]);

  const canManage = ["owner", "admin"].includes(String(context.role));

  return (
    <main
      dir={dir}
      className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-5xl flex-col gap-4 p-4"
    >
      <CommanderConsole
        lang={lang}
        canManage={canManage}
        currentUserId={context.user.id}
        initialTasks={historyPage.tasks}
        initialNextCursor={historyPage.nextCursor}
        initialApprovals={approvals}
        initialDecisions={decisions}
        agents={agents}
      />
    </main>
  );
}
