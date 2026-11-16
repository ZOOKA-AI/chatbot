import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getRewardsSummary, referralLink } from "@/lib/growth/referrals";
import { getLang } from "@/lib/i18n";

import { ShareButtons } from "./share-buttons";

export default async function RewardsPage() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");

  const lang = await getLang();
  const ar = lang === "ar";
  const summary = await getRewardsSummary(context.user.id);
  const link = referralLink(summary.code);

  const labels = {
    title: ar ? "المكافآت والإحالات" : "Rewards and referrals",
    subtitle: ar
      ? "شارك رابطك واكسب نقاطًا عند تسجيل مدعويك وتأكيد بريدهم وتنفيذ أول مهمة."
      : "Share your link and earn points when invitees register, verify their email and run their first task.",
    yourLink: ar ? "رابط الإحالة الخاص بك" : "Your referral link",
    available: ar ? "نقاط متاحة" : "Available points",
    pending: ar ? "نقاط معلّقة" : "Pending points",
    referrals: ar ? "إحالات موثقة" : "Verified referrals",
    history: ar ? "سجل المكافآت" : "Reward history",
    empty: ar ? "لا مكافآت بعد." : "No rewards yet.",
    share: ar ? "شارك الدعوة" : "Share the invite",
    ambassador: ar ? "سفير ZOOKA" : "ZOOKA Ambassador",
    nonCash: ar
      ? "النقاط ترويجية وغير قابلة للتحويل إلى نقد أو رصيد دفع."
      : "Points are promotional and cannot be converted to cash or payment credit.",
  };

  const textAr = "انضم إلى ZOOKA-AI، منصة وكلاء الذكاء الاصطناعي لشركات الخدمات:";
  const textEn = "Join ZOOKA-AI, the AI agent platform for service businesses:";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6" dir={ar ? "rtl" : "ltr"}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">{labels.title}</h1>
        <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
      </header>

      <section className="rounded-2xl border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{labels.yourLink}</p>
        <p className="mt-1 break-all font-mono text-sm text-[#2E86AB]">{link}</p>
        <div className="mt-4">
          <ShareButtons link={link} textAr={textAr} textEn={textEn} lang={lang} />
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        {[
          { label: labels.available, value: summary.availablePoints },
          { label: labels.pending, value: summary.pendingPoints },
          { label: labels.referrals, value: summary.verifiedReferrals },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border bg-card p-4 text-center">
            <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </section>

      {summary.ambassador ? (
        <p className="rounded-2xl border border-[#A23B72]/40 bg-[#A23B72]/5 p-3 text-sm text-[#A23B72]">
          {labels.ambassador}
        </p>
      ) : null}

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">{labels.history}</h2>
        {summary.history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="mt-3 divide-y">
            {summary.history.map((row, index) => (
              <li key={`${row.kind}-${index}`} className="flex items-center justify-between py-2 text-sm">
                <span className="text-foreground">{row.kind}</span>
                <span className="flex items-center gap-3">
                  <span className="text-muted-foreground">{row.status}</span>
                  <span className="font-semibold text-foreground">{row.points}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">{labels.nonCash}</p>
    </div>
  );
}
