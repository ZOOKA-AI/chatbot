import { FileLock2, KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "المكتبة الخاصة وخزنة الأسرار · غير مفعلة",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main
      className="mx-auto min-h-dvh max-w-4xl space-y-7 p-6"
      dir="rtl"
      lang="ar"
    >
      <Link className="underline" href="/start">
        العودة إلى البداية / Back to start
      </Link>
      <h1 className="text-3xl font-bold">المكتبة الخاصة وخزنة الأسرار</h1>
      <p className="rounded-xl border border-amber-500 p-4" role="status">
        STORAGE DISABLED — التخزين معطل. هذه صفحة تعريف وهيكل أمان، وليست خزنة
        عاملة. لا تدخل أو ترفع أسراراً هنا؛ لا توجد حقول أو رفع ملفات.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="space-y-4 rounded-2xl border p-6">
          <FileLock2 aria-hidden="true" />
          <h2 className="text-xl font-semibold">
            المحتوى الخاص / Private content
          </h2>
          <p>
            ملاحظات ومستندات وصور وتصنيف وبحث. لم يُنشأ مخزن لهذه البيانات ضمن
            هذه المرحلة.
          </p>
          <button
            className="rounded-lg border p-3 opacity-50"
            disabled
            type="button"
          >
            إضافة محتوى — معطل / Disabled
          </button>
        </section>
        <section className="space-y-4 rounded-2xl border p-6">
          <KeyRound aria-hidden="true" />
          <h2 className="text-xl font-semibold">Secure Vault</h2>
          <p>
            مفاتيح API وكلمات المرور ورموز OAuth. تُفصل عن المحتوى العادي وسياسات
            البحث والتصدير. لا يُحفظ أي منها في المتصفح أو السجلات بواسطة هذه
            الصفحة.
          </p>
          <button
            className="rounded-lg border p-3 opacity-50"
            disabled
            type="button"
          >
            إضافة سر — معطل / Disabled
          </button>
        </section>
      </div>
      <section className="space-y-3 rounded-2xl border p-6">
        <ShieldCheck aria-hidden="true" />
        <h2 className="text-xl font-semibold">بوابات التفعيل</h2>
        <ul className="list-inside list-disc space-y-2">
          <li>
            مصادقة قوية وإعادة تحقق للعمليات الحساسة وخطة MFA حقيقية؛ لم تُفعّل
            MFA جديدة.
          </li>
          <li>
            تشفير موثّق مع إدارة مفاتيح وتدوير واسترداد، لا تشفير بمفتاح PIN
            قصير.
          </li>
          <li>
            عزل المستخدم والمساحة وRBAC. المطور لا يحصل تلقائياً على حق قراءة
            أسرار العملاء.
          </li>
          <li>
            سجل تدقيق منقّح لعمليات العرض والتعديل والتصدير، دون قيم الأسرار.
          </li>
          <li>
            حدود محاولات وإغلاق مؤقت وإبطال جلسات واختبارات اختراق وعزل
            واسترداد.
          </li>
          <li>
            ملفات خاصة بروابط محمية وفحص المحتوى والتحميل؛ لا رفع قبل اكتمال
            الحماية.
          </li>
        </ul>
        <p className="font-semibold">
          رمز الستة أرقام قفل إضافي فقط، وليس بديلاً عن الدخول أو التشفير.
        </p>
      </section>
      <p>
        None of the vault, MFA, encrypted-file or audit capabilities listed
        above is claimed implemented by this page. Activation requires separate
        security acceptance and owner approval.
      </p>
    </main>
  );
}
