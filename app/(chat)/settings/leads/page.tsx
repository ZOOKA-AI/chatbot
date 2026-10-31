import { redirect } from "next/navigation";
import { LeadStatusSelect } from "@/components/lead-status-select";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { countLeadsByStatus, listLeads } from "@/lib/db/leads";
import { getLang } from "@/lib/i18n";

const STATUS_LABELS = {
  new: { ar: "جديد", en: "New" },
  qualified: { ar: "مؤهل", en: "Qualified" },
  booked: { ar: "محجوز", en: "Booked" },
  won: { ar: "تم", en: "Won" },
  lost: { ar: "خسارة", en: "Lost" },
} as const;

const SOURCE_LABELS = {
  whatsapp_bot: { ar: "بوت الواتساب", en: "WhatsApp bot" },
  owner_whatsapp: { ar: "واتساب المالك", en: "Owner WhatsApp" },
  whatsapp_contacts_forward: { ar: "جهة من الجوال", en: "Forwarded contact" },
  website: { ar: "نموذج الموقع", en: "Website form" },
  "self-test": { ar: "تجربة داخلية", en: "Internal test" },
} as const;

function statusLabel(status: string, ar: boolean) {
  const entry = STATUS_LABELS[status as keyof typeof STATUS_LABELS];
  if (entry) return ar ? entry.ar : entry.en;
  return status;
}

function sourceLabel(source: string | null, ar: boolean) {
  if (!source) return "—";
  const entry = SOURCE_LABELS[source as keyof typeof SOURCE_LABELS];
  return entry ? (ar ? entry.ar : entry.en) : source;
}

export default async function LeadsSettingsPage() {
  const context = await getWorkspaceContext();
  if (!context || context.user.type === "guest") {
    redirect("/login");
  }

  const lang = await getLang();
  const ar = lang === "ar";
  const [leads, counts] = await Promise.all([
    listLeads(context.organizationId),
    countLeadsByStatus(context.organizationId),
  ]);

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const dateFormat = new Intl.DateTimeFormat(ar ? "ar-AE" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6"
      dir={ar ? "rtl" : "ltr"}
    >
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">{ar ? "الليدز" : "Leads"}</h1>
        <p className="text-muted-foreground text-sm">
          {ar
            ? `كل من طلب خدمة، من الواتساب أو نموذج الموقع أو جهات جوالك. الإجمالي ${total}.`
            : `Everyone who asked for a service, from WhatsApp, the website form or your own contacts. Total ${total}.`}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map(
          (status) => (
            <div className="rounded-lg border p-3" key={status}>
              <p className="text-muted-foreground text-xs">
                {statusLabel(status, ar)}
              </p>
              <p className="font-semibold text-xl">{counts[status] ?? 0}</p>
            </div>
          )
        )}
      </div>

      {leads.length === 0 ? (
        <p className="rounded-lg border p-5 text-muted-foreground text-sm">
          {ar
            ? "لا يوجد ليدز بعد. أول رسالة على بوت الواتساب ستظهر هنا."
            : "No leads yet. The first WhatsApp bot conversation shows up here."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="p-3 text-start font-medium">{ar ? "الاسم" : "Name"}</th>
                <th className="p-3 text-start font-medium">{ar ? "الجوال" : "Phone"}</th>
                <th className="p-3 text-start font-medium">{ar ? "الخدمة" : "Service"}</th>
                <th className="p-3 text-start font-medium">{ar ? "المصدر" : "Source"}</th>
                <th className="p-3 text-start font-medium">{ar ? "الحالة" : "Status"}</th>
                <th className="p-3 text-start font-medium">{ar ? "آخر تواصل" : "Last contact"}</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr className="border-t align-top" key={lead.id}>
                  <td className="p-3">
                    <p className="font-medium">{lead.name ?? "—"}</p>
                    {lead.city ? (
                      <p className="text-muted-foreground text-xs">{lead.city}</p>
                    ) : null}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {lead.phone ? (
                      <a className="underline" href={`tel:${lead.phone}`}>
                        {lead.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-64 p-3">
                    <p>{lead.service ?? "—"}</p>
                    {lead.notes ? (
                      <p className="mt-1 text-muted-foreground text-xs leading-5">
                        {lead.notes}
                      </p>
                    ) : null}
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs">
                    {sourceLabel(lead.source, ar)}
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs">
                    <LeadStatusSelect
                      lang={lang}
                      leadId={lead.id}
                      status={
                        (lead.status as keyof typeof STATUS_LABELS) in STATUS_LABELS
                          ? (lead.status as keyof typeof STATUS_LABELS)
                          : "new"
                      }
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                    {lead.lastContactAt
                      ? dateFormat.format(new Date(lead.lastContactAt))
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {ar
          ? "الصفحة تقرأ من جدول الليدز في قاعدة بياناتك. الربط التلقائي مع بوت الواتساب خطوة تالية."
          : "This page reads your own lead table. Live sync with the WhatsApp bot is the next step."}
      </p>
    </main>
  );
}
