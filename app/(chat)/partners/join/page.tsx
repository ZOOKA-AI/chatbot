"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { useBilling } from "@/components/billing-provider";

const formSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  platform: z.string().trim().max(120),
  code: z.string().trim().max(40),
  notes: z.string().trim().max(2000),
});

type PartnerForm = z.infer<typeof formSchema>;

const emptyForm: PartnerForm = {
  name: "",
  email: "",
  platform: "",
  code: "",
  notes: "",
};

const partnerContact = "zookaalmrzwq@gmail.com";

export default function PartnerJoinPage() {
  const { lang } = useBilling();
  const isAr = lang === "ar";
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [emailOpened, setEmailOpened] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      setError(
        isAr
          ? "تحقق من الاسم والبريد الإلكتروني وأطوال الحقول."
          : "Check the name, email, and field lengths."
      );
      return;
    }

    const subject = encodeURIComponent("طلب شراكة - Zooka AI");
    const body = encodeURIComponent(
      `الاسم: ${parsed.data.name}\nالبريد: ${parsed.data.email}\nالمنصة: ${parsed.data.platform || "—"}\nالكود المقترح: ${parsed.data.code || "—"}\nملاحظات: ${parsed.data.notes || "—"}`
    );
    window.location.href = `mailto:${partnerContact}?subject=${subject}&body=${body}`;
    setEmailOpened(true);
  }

  function updateForm(field: keyof PartnerForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-6 py-16"
      dir={isAr ? "rtl" : "ltr"}
      lang={lang}
    >
      <header className="text-center">
        <h1 className="font-semibold text-3xl">
          {isAr ? "تسجيل شريك" : "Partner application"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAr
            ? "املأ البيانات وسيفتح تطبيق البريد لإرسال طلبك للمراجعة."
            : "Fill in the details; your email app will open to send your application for review."}
        </p>
      </header>

      {emailOpened ? (
        <section className="rounded-xl border p-6 text-center">
          <p className="font-medium text-green-600">
            {isAr ? "تم فتح تطبيق البريد" : "Email app opened"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAr
              ? "أرسل الرسالة من تطبيق البريد لإكمال طلبك. لم يُرسل الطلب تلقائياً."
              : "Send the message from your email app to complete your application. It has not been sent automatically."}
          </p>
          <Link
            className="mt-4 inline-block text-sm underline"
            href="/partners"
          >
            {isAr ? "العودة إلى صفحة الشركاء" : "Back to partners"}
          </Link>
        </section>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            {isAr ? "الاسم الكامل" : "Full name"}
            <input
              autoComplete="name"
              className="rounded-md border bg-background px-3 py-2"
              maxLength={120}
              minLength={2}
              onChange={(event) => updateForm("name", event.target.value)}
              required
              value={form.name}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {isAr ? "البريد الإلكتروني" : "Email"}
            <input
              autoComplete="email"
              className="rounded-md border bg-background px-3 py-2"
              maxLength={254}
              onChange={(event) => updateForm("email", event.target.value)}
              required
              type="email"
              value={form.email}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {isAr ? "المنصة" : "Platform"}
            <input
              className="rounded-md border bg-background px-3 py-2"
              maxLength={120}
              onChange={(event) => updateForm("platform", event.target.value)}
              placeholder={
                isAr
                  ? "إنستغرام، يوتيوب، تيك توك..."
                  : "Instagram, YouTube, TikTok..."
              }
              value={form.platform}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {isAr ? "الكود المقترح (اختياري)" : "Suggested code (optional)"}
            <input
              className="rounded-md border bg-background px-3 py-2 uppercase"
              maxLength={40}
              onChange={(event) =>
                updateForm("code", event.target.value.toUpperCase())
              }
              placeholder="AHMED20"
              value={form.code}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {isAr
              ? "ملاحظات أو عدد المتابعين التقريبي"
              : "Notes or approximate audience size"}
            <textarea
              className="rounded-md border bg-background px-3 py-2"
              maxLength={2000}
              onChange={(event) => updateForm("notes", event.target.value)}
              rows={3}
              value={form.notes}
            />
          </label>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <button
            className="rounded-md bg-primary py-2.5 font-medium text-primary-foreground"
            type="submit"
          >
            {isAr ? "إرسال الطلب بالبريد" : "Prepare application email"}
          </button>
        </form>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link className="underline" href="/partners">
          {isAr ? "صفحة الشركاء" : "Partner program"}
        </Link>
      </p>
    </main>
  );
}
