import { AdminDenied, adminPageContext } from "@/lib/admin/page-guard";
import { AgentConsole } from "@/components/agent-console";
import { AgentBrowserDock } from "@/components/agent-browser-dock";
import { getBilling } from "@/lib/admin/sections";
import { COMMANDS } from "@/lib/agent/commands";
import { SectionView } from "@/components/admin/ui";

export const metadata = { title: "الوكيل الأعلى — ZOOKA AI" };

const PLAN_LIMITS: Record<string, number> = {
  free: 30,
  starter: 100,
  pro: 500,
  business: 2000,
};

/**
 * The Super Admin Agent, wired to the same brain the workspace already uses.
 *
 * The chat is the existing agent console, so admin and member turns share one audited path instead of a
 * second agent invented for this page. The catalogue beside it is the real command contract: each entry
 * carries the minimum role the handler enforces, so what the agent can do is visible before it acts.
 */
export default async function AdminCommandPage() {
  const admin = await adminPageContext();
  if (!admin) return <AdminDenied />;
  const lang = admin.lang;
  const billing = await getBilling(admin.organizationId);
  const limit = PLAN_LIMITS[billing.plan] ?? PLAN_LIMITS.free;

  return (
    <SectionView
      lang={lang}
      title={lang === "ar" ? "الوكيل الأعلى" : "Super admin agent"}
      description={
        lang === "ar"
          ? "محادثة واحدة تنفّذ وتراقب وتشرح. كل أمر يمر بقائمة الأوامر أدناه، وحدوده معلنة قبل التنفيذ."
          : "One conversation to run, watch and explain. Every command goes through the catalogue below, with its limits declared before it runs."
      }
    >
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border border-white/10 bg-[#070d18] p-3">
          <AgentConsole limit={limit} plan={billing.plan} used={billing.agentRuns} />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-sm font-medium text-white">
            {lang === "ar" ? "أوامر الوكيل" : "Agent commands"}
          </p>
          <ul className="mt-2 space-y-2">
            {COMMANDS.map((command) => (
              <li key={command.id} className="rounded-lg border border-white/10 p-2">
                <p className="text-xs text-white">{command.titleAr}</p>
                <p className="mt-0.5 text-[11px] text-white/50">{command.descriptionAr}</p>
                <p dir="ltr" className="mt-1 font-mono text-[10px] text-white/30">
                  {command.id} · min={command.minimumRole}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/40">
            {lang === "ar"
              ? "ما ليس في هذه القائمة لا ينفّذه الوكيل، وكل أمر يتجاوز دورك يُرفض في نفس المعالج."
              : "Anything not in this list is not executed, and a command above your role is refused by its own handler."}
          </p>
        </div>
      </div>
      <AgentBrowserDock />
    </SectionView>
  );
}
