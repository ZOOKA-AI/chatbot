"use client";

import { useState, useTransition } from "react";

import {
  archiveMessageAction,
  checkAvailabilityAction,
  reserveAddressAction,
  saveDraftAction,
  sendDraftAction,
  suggestDraftAction,
  summarizeAction,
} from "./actions";

type Mailbox = { id: string; address: string; status: string; provider: string };
type Message = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  bodyHtml: string;
  receivedAt: string;
  isRead: boolean;
  aiSummary: string | null;
};
type Draft = { id: string; subject: string | null; to: string; aiGenerated: boolean; updatedAt: string };
type Provider = {
  id: string;
  label: string;
  status: "available" | "not_activated";
  read: boolean;
  send: boolean;
  requirement: string;
};

const FOLDERS = ["inbox", "sent", "drafts", "archive"] as const;

const COPY = {
  ar: {
    title: "بريد ZOOKA",
    subtitle: "صندوق موحّد على نطاق zooka-ai.com، مع مساعد يلخّص ويقترح ولا يرسل.",
    reserve: "احجز عنوانك",
    reserveHint: "حروف إنجليزية وأرقام ونقطة أو شرطة، من 3 إلى 32 حرفًا.",
    check: "تحقّق من التوفر",
    take: "احجز",
    available: "متاح",
    taken: "غير متاح",
    inbox: "الوارد",
    sent: "المُرسل",
    drafts: "المسودات",
    archive: "الأرشيف",
    empty: "لا رسائل في هذا المجلد بعد.",
    emptyDrafts: "لا مسودات بعد.",
    summarize: "لخّص",
    summarizing: "جارٍ التلخيص…",
    archiveIt: "أرشف",
    providers: "حسابات البريد",
    notActivated: "غير مُفعّل",
    availableNow: "متاح",
    readOnly: "قراءة فقط",
    sendBlocked: "الإرسال غير مُفعّل",
    notReadyTables: "جداول البريد غير موجودة في هذه البيئة بعد (الهجرة 0060 غير مطبّقة). الواجهة جاهزة، والبيانات فارغة.",
    notReadyService: "هذه البيئة لا تملك اتصال خدمة بقاعدة البيانات (DATABASE_URL_SERVICE)، فتعذّر قراءة البريد.",
    notReadyUnknown: "تعذّر قراءة البريد في هذه البيئة. السبب غير مصنّف، والتفاصيل في سجل الخادم.",
    compose: "مسودة جديدة",
    intent: "اكتب ما تريد قوله باختصار",
    suggest: "اقترح صياغة",
    saveDraft: "حفظ المسودة",
    send: "إرسال",
    noMailbox: "احجز عنوانًا أولًا لتعمل المسودات.",
  },
  en: {
    title: "ZOOKA Mail",
    subtitle: "One inbox on zooka-ai.com, with an assistant that summarises and suggests, never sends.",
    reserve: "Reserve your address",
    reserveHint: "Letters, digits, dot or hyphen, 3 to 32 characters.",
    check: "Check availability",
    take: "Reserve",
    available: "Available",
    taken: "Not available",
    inbox: "Inbox",
    sent: "Sent",
    drafts: "Drafts",
    archive: "Archive",
    empty: "No messages in this folder yet.",
    emptyDrafts: "No drafts yet.",
    summarize: "Summarise",
    summarizing: "Summarising…",
    archiveIt: "Archive",
    providers: "Mail accounts",
    notActivated: "Not activated",
    availableNow: "Available",
    readOnly: "Read only",
    sendBlocked: "Sending is not activated",
    notReadyTables: "The mail tables are not in this environment yet (migration 0060 is unapplied). The interface is ready; the data is empty.",
    notReadyService: "This environment has no service connection to the database (DATABASE_URL_SERVICE), so mail cannot be read.",
    notReadyUnknown: "Mail could not be read in this environment. The cause is unclassified; details are in the server log.",
    compose: "New draft",
    intent: "Say what you want in one line",
    suggest: "Suggest wording",
    saveDraft: "Save draft",
    send: "Send",
    noMailbox: "Reserve an address first to use drafts.",
  },
} as const;

export function MailClient(props: {
  lang: "ar" | "en";
  failure: "tables_missing" | "service_connection" | "unknown" | null;
  activeFolder: string;
  mailboxes: Mailbox[];
  activeMailboxId: string | null;
  messages: Message[];
  drafts: Draft[];
  providers: Provider[];
}) {
  const t = COPY[props.lang];
  const dir = props.lang === "ar" ? "rtl" : "ltr";
  const [localPart, setLocalPart] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [availability, setAvailability] = useState<boolean | null>(null);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [intent, setIntent] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [pending, startTransition] = useTransition();

  const activeMailbox = props.mailboxes.find((entry) => entry.id === props.activeMailboxId) ?? null;

  function check() {
    setFeedback(null);
    setAvailability(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("address", localPart);
      const result = await checkAvailabilityAction(data);
      if (result.ok) {
        setAvailability(result.available === true);
      } else {
        setFeedback(result.message ?? null);
      }
    });
  }

  function reserve() {
    setFeedback(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("localPart", localPart);
      const result = await reserveAddressAction(data);
      setFeedback(result.message ?? null);
      if (result.ok) setAvailability(null);
    });
  }

  function summarize(messageId: string) {
    setSummaryFor(messageId);
    startTransition(async () => {
      const result = await summarizeAction(messageId);
      setSummaryFor(null);
      if (result.ok && result.text) {
        setSummaries((current) => ({ ...current, [messageId]: result.text as string }));
      } else {
        setFeedback(result.message ?? null);
      }
    });
  }

  function suggest() {
    startTransition(async () => {
      const result = await suggestDraftAction(intent, activeMailbox?.address ?? "");
      if (result.ok && result.text) setDraftBody(result.text);
      else setFeedback(result.message ?? null);
    });
  }

  function saveDraft() {
    if (!activeMailbox) {
      setFeedback(t.noMailbox);
      return;
    }
    startTransition(async () => {
      const data = new FormData();
      data.set("mailAddressId", activeMailbox.id);
      data.set("bodyText", draftBody);
      data.set("subject", intent.slice(0, 120));
      const result = await saveDraftAction(data);
      setFeedback(result.message ?? null);
    });
  }

  function send() {
    startTransition(async () => {
      const data = new FormData();
      data.set("confirm", "SEND");
      const result = await sendDraftAction(data);
      setFeedback(result.message ?? null);
    });
  }

  function archive(messageId: string) {
    if (!activeMailbox) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("mailAddressId", activeMailbox.id);
      data.set("messageId", messageId);
      const result = await archiveMessageAction(data);
      setFeedback(result.message ?? null);
    });
  }

  return (
    <div dir={dir} className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">{t.title}</h1>
        <p className="text-sm text-neutral-400">{t.subtitle}</p>
      </header>

      {props.failure && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          {props.failure === "tables_missing"
            ? t.notReadyTables
            : props.failure === "service_connection"
              ? t.notReadyService
              : t.notReadyUnknown}
        </p>
      )}

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
        <h2 className="mb-1 text-sm font-medium text-neutral-200">{t.reserve}</h2>
        <p className="mb-3 text-xs text-neutral-500">{t.reserveHint}</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2">
            <input
              value={localPart}
              onChange={(event) => {
                setLocalPart(event.target.value);
                setAvailability(null);
              }}
              placeholder="yourname"
              className="min-h-9 w-full bg-transparent text-sm text-white outline-none placeholder:text-neutral-600"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="whitespace-nowrap text-sm text-neutral-500">@zooka-ai.com</span>
          </div>
          <button
            type="button"
            onClick={check}
            disabled={pending || localPart.length === 0}
            className="min-h-11 rounded-xl border border-neutral-700 px-4 text-sm text-neutral-200 disabled:opacity-40"
          >
            {t.check}
          </button>
          <button
            type="button"
            onClick={reserve}
            disabled={pending || localPart.length === 0}
            className="min-h-11 rounded-xl bg-[#2E86AB] px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            {t.take}
          </button>
        </div>
        {availability !== null && (
          <p className={`mt-2 text-sm ${availability ? "text-emerald-400" : "text-rose-400"}`}>
            {availability ? t.available : t.taken}
          </p>
        )}
        {feedback && <p className="mt-2 text-sm text-neutral-300">{feedback}</p>}
        {props.mailboxes.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {props.mailboxes.map((mailbox) => (
              <li
                key={mailbox.id}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-300"
              >
                {mailbox.address} · {mailbox.provider}
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="flex gap-2">
        {FOLDERS.map((folder) => (
          <a
            key={folder}
            href={`/workspace/mail?folder=${folder}${activeMailbox ? `&box=${activeMailbox.id}` : ""}`}
            className={`min-h-11 rounded-xl px-4 py-2 text-sm ${
              props.activeFolder === folder
                ? "bg-[#A23B72] text-white"
                : "border border-neutral-800 text-neutral-300"
            }`}
          >
            {t[folder]}
          </a>
        ))}
      </nav>

      {props.activeFolder === "drafts" ? (
        <section className="space-y-2">
          {props.drafts.length === 0 ? (
            <p className="text-sm text-neutral-500">{t.emptyDrafts}</p>
          ) : (
            props.drafts.map((draft) => (
              <article key={draft.id} className="rounded-xl border border-neutral-800 p-3">
                <p className="text-sm text-white">{draft.subject || "(no subject)"}</p>
                <p className="text-xs text-neutral-500">
                  {draft.to || "—"} · {draft.aiGenerated ? "AI" : "manual"}
                </p>
              </article>
            ))
          )}
        </section>
      ) : (
        <section className="space-y-3">
          {props.messages.length === 0 ? (
            <p className="text-sm text-neutral-500">{t.empty}</p>
          ) : (
            props.messages.map((message) => (
              <article key={message.id} className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-white">{message.subject || "(no subject)"}</p>
                  <p className="text-xs text-neutral-500">
                    {new Date(message.receivedAt).toLocaleString(props.lang === "ar" ? "ar-AE" : "en-GB")}
                  </p>
                </div>
                <p className="text-xs text-neutral-400">
                  {message.fromName ? `${message.fromName} · ` : ""}
                  {message.fromAddress}
                </p>
                <div
                  className="prose prose-invert mt-3 max-w-none text-sm text-neutral-300 [&_a]:text-[#2E86AB]"
                  // Sanitised on the server twice: on ingest and on render.
                  dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
                />
                {(summaries[message.id] ?? message.aiSummary) && (
                  <p className="mt-3 whitespace-pre-line rounded-xl border border-[#2E86AB]/30 bg-[#2E86AB]/5 p-3 text-sm text-neutral-200">
                    {summaries[message.id] ?? message.aiSummary}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => summarize(message.id)}
                    disabled={pending}
                    className="min-h-11 rounded-xl border border-neutral-700 px-4 text-sm text-neutral-200 disabled:opacity-40"
                  >
                    {summaryFor === message.id ? t.summarizing : t.summarize}
                  </button>
                  <button
                    type="button"
                    onClick={() => archive(message.id)}
                    disabled={pending}
                    className="min-h-11 rounded-xl border border-neutral-700 px-4 text-sm text-neutral-200 disabled:opacity-40"
                  >
                    {t.archiveIt}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-200">{t.compose}</h2>
        <textarea
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder={t.intent}
          rows={2}
          className="w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-sm text-white outline-none placeholder:text-neutral-600"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={suggest}
            disabled={pending || intent.trim().length < 3}
            className="min-h-11 rounded-xl border border-neutral-700 px-4 text-sm text-neutral-200 disabled:opacity-40"
          >
            {t.suggest}
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={pending}
            className="min-h-11 rounded-xl border border-neutral-700 px-4 text-sm text-neutral-200 disabled:opacity-40"
          >
            {t.saveDraft}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={pending}
            title={t.sendBlocked}
            className="min-h-11 rounded-xl border border-rose-500/40 px-4 text-sm text-rose-300 disabled:opacity-40"
          >
            {t.send} · {t.sendBlocked}
          </button>
        </div>
        {draftBody && (
          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-200">
            {draftBody}
          </pre>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-800 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-200">{t.providers}</h2>
        <ul className="space-y-2">
          {props.providers.map((provider) => (
            <li key={provider.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-neutral-200">{provider.label}</span>
              <span className="text-xs text-neutral-400">
                {provider.status === "available" ? t.availableNow : t.notActivated} ·{" "}
                {provider.read ? (provider.send ? "read+send" : t.readOnly) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
