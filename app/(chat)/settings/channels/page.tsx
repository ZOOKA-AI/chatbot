import { redirect } from "next/navigation";

import { ChannelsSettings } from "@/components/settings/channels-settings";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { listAgentChannels } from "@/lib/db/agent-channels";
import { listWorkspaceSecrets } from "@/lib/db/workspace-secrets";


export const metadata = { title: "القنوات — ZOOKA-AI" };

export default async function ChannelsSettingsPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const [channels, secrets] = await Promise.all([
    listAgentChannels(context.organizationId),
    listWorkspaceSecrets(context.organizationId),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">القنوات</h1>
        <p className="text-muted-foreground text-sm">
          اربط تلجرام أو واتساب أو سلاك بوكيل مساحة العمل. الرسائل الواردة من مرسل مرتبط تُوجَّه إلى الوكيل نفسه الذي يجيب في المحادثة، والرد يعود على نفس القناة.
        </p>
      </header>
      <ChannelsSettings
        initialChannels={channels.map((channel) => ({
          id: channel.id,
          provider: channel.provider,
          externalId: channel.externalId,
          displayName: channel.displayName,
          enabled: channel.enabled,
          messageCount: channel.messageCount,
          lastSeenAt: channel.lastSeenAt ? channel.lastSeenAt.toISOString() : null,
          secretName: channel.secretName,
        }))}
        isArabic
        secretNames={secrets.map((secret) => secret.name)}
      />
    </main>
  );
}
