import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getPublicAgentTemplate } from "@/lib/agents/templates";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { UseAgentTemplateButton } from "./use-template-button";

export default async function AgentTemplatePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const template = await getPublicAgentTemplate(token);
  if (!template) notFound();

  const workspace = await getWorkspaceContext();
  const canCopy = workspace && workspace.user.type !== "guest" && ["owner", "admin"].includes(workspace.role);
  const needsAdmin = workspace && workspace.user.type !== "guest" && !canCopy;
  const signInUrl = `/login?callbackUrl=${encodeURIComponent(`/templates/${token}`)}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm opacity-60">Public agent template</p>
        <h1 className="text-3xl font-semibold">{template.agent.displayName}</h1>
        <p className="text-sm opacity-70">Role: {template.agent.role}</p>
      </header>

      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-semibold">Instructions</h2>
        <p className="whitespace-pre-wrap text-sm">{template.agent.instructions || "No custom instructions."}</p>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-semibold">Enabled skills</h2>
        {template.agent.allowedTools.length ? (
          <ul className="list-inside list-disc text-sm">
            {template.agent.allowedTools.map((tool) => <li key={tool}>{tool}</li>)}
          </ul>
        ) : (
          <p className="text-sm opacity-70">No skills are enabled.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-semibold">Permissions</h2>
        {template.agent.scopes.length ? (
          <ul className="list-inside list-disc text-sm">
            {template.agent.scopes.map((scope) => <li key={scope}>{scope}</li>)}
          </ul>
        ) : (
          <p className="text-sm opacity-70">No agent permissions are enabled.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-semibold">Schedules and automations</h2>
        {template.schedules.length ? (
          <ul className="flex flex-col gap-3">
            {template.schedules.map((schedule, index) => (
              <li key={`${schedule.title}-${index}`} className="border-t pt-2 text-sm first:border-0 first:pt-0">
                <p className="font-medium">{schedule.title}</p>
                <p className="opacity-70">
                  {schedule.cronExpression} · {schedule.timezone} · {schedule.enabled ? "Enabled" : "Paused"}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{schedule.instruction}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm opacity-70">No schedules are included.</p>
        )}
      </section>

      {canCopy ? (
        <UseAgentTemplateButton token={token} />
      ) : needsAdmin ? (
        <p className="text-sm opacity-70">Ask a workspace owner or admin to use this template.</p>
      ) : (
        <Link className="w-fit rounded bg-black px-4 py-2 text-sm text-white" href={signInUrl}>
          Sign in to use this template
        </Link>
      )}
      <p className="text-xs opacity-60">
        Only this configuration is copied. Keys, connections, secrets, chat history, and workspace data are not included.
      </p>
    </main>
  );
}
