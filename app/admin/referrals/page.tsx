import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { requirePlatformRole } from "@/lib/auth/platform-role";
import { addAffiliateAction } from "./actions";
import { db } from "@/lib/db/queries";
import { affiliate } from "@/lib/db/schema";
import { getReferralReport } from "@/lib/affiliate";
import { referralEvent } from "@/lib/db/schema";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function AdminReferralsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<main className="p-8 text-sm">Loading referral report…</main>}>
      <AdminReferralsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminReferralsContent({ searchParams }: PageProps) {
  await searchParams;
  // Platform administrators only, by PlatformRole grant. This page used to accept
  // a hard-coded email list (which mixed in an account from another business) or
  // the backup token in the URL, where it lands in history and access logs.
  const admin = await requirePlatformRole("admin", "admin.referrals.view");
  if (!admin) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="font-semibold text-xl">Not authorized</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Referral analytics are for platform administrators only.
        </p>
      </main>
    );
  }

  const [rows, partners, totals] = await Promise.all([
    getReferralReport(),
    db.select().from(affiliate).orderBy(affiliate.createdAt),
    db
      .select({
        clicks: sql<string>`count(*) filter (where ${referralEvent.event} = 'click')`,
        signups: sql<string>`count(*) filter (where ${referralEvent.event} = 'signup')`,
        subscriptions: sql<string>`count(*) filter (where ${referralEvent.event} = 'subscribe')`,
        dailySignups: sql<string>`count(*) filter (where ${referralEvent.event} = 'signup' and ${referralEvent.createdAt} > now() - interval '7 days')`,
        dailySubs: sql<string>`count(*) filter (where ${referralEvent.event} = 'subscribe' and ${referralEvent.createdAt} > now() - interval '7 days')`,
      })
      .from(referralEvent),
  ]);

  const pctByCode = new Map(partners.map((p) => [p.code, p.commissionPct]));
  const summary = totals[0];
  const clicks = Number(summary?.clicks ?? 0);
  const signups = Number(summary?.signups ?? 0);
  const subs = Number(summary?.subscriptions ?? 0);
  const totalMrrCents = rows.reduce((sum, r) => sum + r.mrrCents, 0);
  const totalCommissionCents = rows.reduce(
    (sum, r) => sum + Math.round((r.mrrCents * (pctByCode.get(r.code) ?? 20)) / 100),
    0
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">Zooka referral &amp; affiliate report</h1>
        <p className="text-muted-foreground text-sm">
          Funnel: visitors, signups, paying subscribers, and commission per partner code.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visits" value={clicks.toString()} />
        <Stat label="Signups" value={signups.toString()} />
        <Stat label="Subscriptions" value={subs.toString()} />
        <Stat
          label="Partner MRR"
          value={`$${(totalMrrCents / 100).toFixed(2)}`}
        />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label="Visit to signup"
          value={clicks > 0 ? `${((signups / clicks) * 100).toFixed(1)}%` : "-"}
        />
        <Stat
          label="Signup to paid"
          value={signups > 0 ? `${((subs / signups) * 100).toFixed(1)}%` : "-"}
        />
        <Stat
          label="Commission owed / mo"
          value={`$${(totalCommissionCents / 100).toFixed(2)}`}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">Per partner code</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-2">Code</th>
                <th className="p-2">Name</th>
                <th className="p-2">Visits</th>
                <th className="p-2">Signups</th>
                <th className="p-2">Subs</th>
                <th className="p-2">MRR</th>
                <th className="p-2">Commission</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className="p-2 text-muted-foreground" colSpan={7}>
                    No referral activity yet. Share a link like
                    /r/CODE to start tracking.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const pct = pctByCode.get(row.code) ?? 20;
                const partner = partners.find((p) => p.code === row.code);
                return (
                  <tr className="border-t" key={row.code}>
                    <td className="p-2 font-mono">{row.code}</td>
                    <td className="p-2">
                      {partner?.name ?? "-"}
                      {partner?.platform ? ` (${partner.platform})` : ""}
                    </td>
                    <td className="p-2">{row.clicks}</td>
                    <td className="p-2">{row.signups}</td>
                    <td className="p-2">{row.subscriptions}</td>
                    <td className="p-2">${(row.mrrCents / 100).toFixed(2)}</td>
                    <td className="p-2">
                      ${((row.mrrCents * pct) / 100 / 100).toFixed(2)} ({pct}%)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {admin.role === "super_admin" ? (
        <form action={addAffiliateAction} className="flex flex-wrap items-end gap-2 rounded-lg border p-3 text-sm">
          <label className="flex flex-col gap-1">
            Code
            <input className="rounded border bg-transparent px-2 py-1" name="code" required />
          </label>
          <label className="flex flex-col gap-1">
            Name
            <input className="rounded border bg-transparent px-2 py-1" name="name" />
          </label>
          <label className="flex flex-col gap-1">
            Platform
            <input className="rounded border bg-transparent px-2 py-1" name="platform" />
          </label>
          <label className="flex flex-col gap-1">
            Commission %
            <input className="w-20 rounded border bg-transparent px-2 py-1" defaultValue="20" name="pct" type="number" min="0" max="100" />
          </label>
          <button className="rounded bg-primary px-3 py-1.5 text-primary-foreground" type="submit">
            Create or update partner
          </button>
        </form>
      ) : null}

      <section className="text-muted-foreground text-xs">
        <p className="mt-1">
          Share links as https://zooka-ai.com/r/CODE (cookie lasts 60 days).
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold text-xl">{value}</p>
    </div>
  );
}
