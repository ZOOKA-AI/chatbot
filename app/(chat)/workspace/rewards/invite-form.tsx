"use client";

import { useActionState } from "react";

import { sendInviteAction, type InviteState } from "./actions";

const initial: InviteState = { status: "idle", message: "" };

/** Invitations are always user initiated: nothing leaves until this form is submitted. */
export function InviteForm({ lang }: { lang: "ar" | "en" }) {
  const [state, formAction, pending] = useActionState(sendInviteAction, initial);
  const ar = lang === "ar";
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-foreground" htmlFor="recipients">
        {ar ? "ادعُ أصدقاءك بالبريد" : "Invite friends by email"}
      </label>
      <textarea
        id="recipients"
        name="recipients"
        rows={2}
        dir="ltr"
        placeholder="name@example.com, second@example.com"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <input
        name="note"
        maxLength={400}
        placeholder={ar ? "رسالة قصيرة (اختياري)" : "Short note (optional)"}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[#2E86AB] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? (ar ? "جارٍ الإرسال…" : "Sending…") : ar ? "إرسال الدعوات" : "Send invitations"}
        </button>
        <span className="text-xs text-muted-foreground">
          {ar ? "حتى 5 عناوين، 10 دعوات يوميًا" : "Up to 5 addresses, 10 per day"}
        </span>
      </div>
      {state.message ? (
        <p className={state.status === "sent" ? "text-sm text-emerald-500" : "text-sm text-amber-500"}>
          {state.message}
          {state.detail?.length ? (
            <span className="block text-xs text-muted-foreground">{state.detail.join(" · ")}</span>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
