"use client";

import { useState } from "react";

import { CHANNEL_LABELS, CHANNEL_PROVIDERS, type ChannelProvider } from "@/lib/agent/channels/providers";

type ChannelRow = {
  id: string;
  provider: string;
  externalId: string;
  displayName: string | null;
  enabled: boolean;
  messageCount: number;
  lastSeenAt: string | null;
  secretName: string;
};

const SENDER_HINTS: Record<ChannelProvider, { ar: string; en: string }> = {
  telegram: { ar: "معرّف المحادثة الرقمي (chat id)", en: "Numeric chat id" },
  whatsapp: { ar: "رقم واتساب بالصيغة الدولية بلا +", en: "WhatsApp number in E.164 without +" },
  slack: { ar: "معرّف القناة مثل C01234567", en: "Channel id such as C01234567" },
};

export function ChannelsSettings({
  initialChannels,
  secretNames,
  isArabic,
}: {
  initialChannels: ChannelRow[];
  secretNames: string[];
  isArabic: boolean;
}) {
  const t = (ar: string, en: string) => (isArabic ? ar : en);
  const [channels, setChannels] = useState<ChannelRow[]>(initialChannels);
  const [provider, setProvider] = useState<ChannelProvider>("telegram");
  const [externalId, setExternalId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [secretName, setSecretName] = useState(secretNames[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function link(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/agent-channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, externalId, displayName, secretName }),
      });
      const payload = (await response.json().catch(() => ({}))) as { channel?: ChannelRow; error?: string };
      if (!response.ok || !payload.channel) {
        setError(payload.error ?? t("تعذّر الربط", "Could not link"));
        return;
      }
      const linked = payload.channel;
      setChannels((current) => [
        ...current.filter((row) => !(row.provider === linked.provider && row.externalId === linked.externalId)),
        { ...linked, messageCount: 0, lastSeenAt: null },
      ]);
      setExternalId("");
      setDisplayName("");
      setMessage(t("تم ربط المرسل", "Sender linked"));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent-channels/${id}`, { method: "DELETE" });
      if (response.ok) {
        setChannels((current) => current.filter((row) => row.id !== id));
      } else {
        setError(t("تعذّر إلغاء الربط", "Could not unlink"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-semibold text-lg">{t("ربط مرسل بقناة", "Link a sender to a channel")}</h2>
        <p className="text-muted-foreground text-sm">
          {t(
            "كل قناة تحتاج سرًّا محفوظًا في خزنة مساحة العمل بصيغة JSON: تلجرام {token}، واتساب {token, phoneNumberId}، سلاك {token}. الربط لا يخزّن أي توكن في قاعدة البيانات.",
            "Each channel needs a secret in the workspace vault holding JSON: Telegram {token}, WhatsApp {token, phoneNumberId}, Slack {token}. Linking never stores a token in the database."
          )}
        </p>
      </section>

      {secretNames.length === 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {t("لا توجد أسرار في الخزنة بعد. أضف سرًّا أولًا ثم ارجع لهذه الصفحة.", "The vault is empty. Add a secret first, then come back.")}
        </p>
      ) : null}

      <form className="grid gap-3 sm:grid-cols-2" onSubmit={link}>
        <label className="text-sm">
          {t("القناة", "Channel")}
          <select
            className="mt-1 w-full rounded-md border bg-transparent p-2"
            onChange={(event) => setProvider(event.target.value as ChannelProvider)}
            value={provider}
          >
            {CHANNEL_PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {isArabic ? CHANNEL_LABELS[value].ar : CHANNEL_LABELS[value].en}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          {t("معرّف المرسل", "Sender id")}
          <input
            className="mt-1 w-full rounded-md border bg-transparent p-2"
            onChange={(event) => setExternalId(event.target.value)}
            placeholder={isArabic ? SENDER_HINTS[provider].ar : SENDER_HINTS[provider].en}
            required
            value={externalId}
          />
        </label>

        <label className="text-sm">
          {t("الاسم الظاهر (اختياري)", "Display name (optional)")}
          <input
            className="mt-1 w-full rounded-md border bg-transparent p-2"
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </label>

        <label className="text-sm">
          {t("السر من الخزنة", "Vault secret")}
          <select
            className="mt-1 w-full rounded-md border bg-transparent p-2"
            onChange={(event) => setSecretName(event.target.value)}
            value={secretName}
          >
            {secretNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="sm:col-span-2">
          <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy || !secretName} type="submit">
            {busy ? t("جارٍ الربط…", "Linking…") : t("ربط", "Link")}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-500">{message}</p> : null}

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">{t("القنوات المرتبطة", "Linked channels")}</h2>
        {channels.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("لا توجد قنوات مرتبطة بعد.", "No channels linked yet.")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {channels.map((channel) => (
              <li className="flex items-center justify-between gap-3 p-3 text-sm" key={channel.id}>
                <div>
                  <p className="font-medium">
                    {isArabic ? CHANNEL_LABELS[channel.provider as ChannelProvider]?.ar ?? channel.provider : CHANNEL_LABELS[channel.provider as ChannelProvider]?.en ?? channel.provider}
                    {" · "}
                    {channel.externalId}
                  </p>
                  <p className="text-muted-foreground">
                    {channel.displayName ? `${channel.displayName} · ` : ""}
                    {t("الرسائل", "messages")}: {channel.messageCount}
                    {channel.lastSeenAt ? ` · ${new Date(channel.lastSeenAt).toLocaleString(isArabic ? "ar" : "en")}` : ""}
                  </p>
                </div>
                <button className="rounded-md border px-3 py-1 disabled:opacity-50" disabled={busy} onClick={() => unlink(channel.id)} type="button">
                  {t("إلغاء الربط", "Unlink")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-md border p-3 text-sm">
        <h3 className="font-semibold">{t("ما يعمل فعليًا الآن", "What actually works now")}</h3>
        <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
          <li>{t("تلجرام: استقبال الرسائل والرد عليها من وكيل مساحة العمل.", "Telegram: inbound messages are answered by the workspace agent.")}</li>
          <li>{t("سلاك: استقبال أحداث الرسائل والرد عليها بعد التحقق من توقيع سلاك.", "Slack: message events are answered after Slack signature verification.")}</li>
          <li>{t("واتساب: إرسال ردود من الوكيل إلى الرقم المرتبط؛ الاستقبال يصل عبر webhook واتساب الحالي.", "WhatsApp: the agent can send to the linked number; inbound still arrives through the existing WhatsApp webhook.")}</li>
        </ul>
      </section>
    </div>
  );
}
