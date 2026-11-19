import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentConsole } from "@/components/base44/agent-console";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { isBase44AgentConfigured } from "@/lib/base44/agent";
import { getBase44UsageThisMonth } from "@/lib/base44/store";
import { getWorkspaceBilling } from "@/lib/db/queries";
import { getWorkspaceEntitlements } from "@/lib/saas/entitlements";

export default async function Base44AgentPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const [entitlements, billing, metering] = await Promise.all([
    getWorkspaceEntitlements(context.organizationId),
    getWorkspaceBilling(context.organizationId),
    getBase44UsageThisMonth(context.user.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-muted-foreground text-sm">Base44</p>
        <h1 className="font-semibold text-2xl">وكيل Base44</h1>
        <p className="text-muted-foreground text-sm">
          وكيل Superagent يعمل داخل مساحة عملك، ولكل عضو محادثته واستهلاكه
          المستقل.
        </p>
      </header>

      {isBase44AgentConfigured() ? null : (
        <p className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm">
          مفتاح الوكيل غير مضبوط على هذا البيئة. أضف BASE44_AGENT_API_KEY و
          BASE44_AGENT_APP_ID في إعدادات Vercel.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">الرسائل المستخدمة</dt>
          <dd className="font-medium">
            {billing.usage.messages} / {entitlements.messagesLimit}
          </dd>
        </div>
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">جولات الوكيل</dt>
          <dd className="font-medium">{metering.turns}</dd>
        </div>
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">كريدت هذا الشهر</dt>
          <dd className="font-medium">{metering.credits}</dd>
        </div>
      </dl>

      <AgentConsole
        canUseAgent={entitlements.canUseAgentMode}
        plan={entitlements.plan}
      />

      <Link className="text-sm underline" href="/workspace/billing">
        إدارة الخطة والاستهلاك
      </Link>
    </main>
  );
}
