import { auth } from "@/app/(auth)/auth";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { affiliate } from "@/lib/db/schema";
import { getReferralReport, normalizeCode } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    k?: string;
    add?: string;
    name?: string;
    pct?: string;
    platform?: string;
  }>;
};

async function addAffiliate(
  code: string,
  name: string | undefined,
  platform: string | undefined,
  pct: string | undefined
) {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return;
  }
  const commissionPct = Number.parseInt(pct ?? "20", 10);
  const existing = await db
    .select({ id: affiliate.id })
    .from(affiliate)
    .where(eq(affiliate.code, normalized))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(affiliate)
      .set({
        name: name ?? null,
        platform: platform ?? null,
        commissionPct: Number.isFinite(commissionPct) ? commissionPct : 20,
      })
      .where(eq(affiliate.code, normalized));
    return;
  }

  await db.insert(affiliate).values({
    code: normalized,
    name: name ?? null,
    platform: platform ?? null,
    commissionPct: Number.isFinite(commissionPct) ? commissionPct : 20,
  });
}

export default async function AdminReferralsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const adminEmails = (
    process.env.ADMIN_EMAILS ??
    "zookaalmrzwq@gmail.com,solas.test@zooka-ai.com,helmyharoon8@gmail.com"
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const session = await auth();
  const sessionEmail = session?.user?.email?.toLowerCase();
  const tokenOk = Boolean(params.k) && params.k === process.env.BACKUP_TOKEN;
  const sessionOk =
    Boolean(sessionEmail) && adminEmails.includes(sessionEmail as string);

  if (!tokenOk && !sessionOk) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="font-semibold text-xl">Not authorized</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Sign in with an admin account, or add the admin key to the URL, to view
          referral analytics.
        </p>
      </main>
    );
  }

  if (params.add) {
    await addAffiliate(params.add, params.name, params.platform, params.pct);
  }

  await db.execute(sql`select 1`);

  const [rows, partners, totals] = await Promise.all([
    getReferralReport(),
    db.select().from(affiliate).orderBy(affiliate.createdAt),
    db
      .select({
        clicks: sql<string>`count(*) filter (where "event" = 'click')`,
        signups: sql<string>`count(*) filter (where "event" = 'signup')`,
        subscriptions: sql<string>`count(*) filter (where "event" = 'subscribe')`,
        dailySignups: sql<string>`count(*) filter (where "event" = 'signup' and "createdAt" > now() - interval '7 days')`,
        dailySubs: sql<string>`count(*) filter (where "event" = 'subscribe' and "createdAt" > now() - interval '7 days')`,
      })
      .from(sql`"ReferralEvent"`),
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

      <section className="text-muted-foreground text-xs">
        <p>
          Create or update a partner:
          /admin/referrals?k=KEY&amp;add=CODE&amp;name=NAME&amp;pct=20&amp;platform=instagram
        </p>
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
