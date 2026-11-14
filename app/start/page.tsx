import {
  Bot,
  Cable,
  LayoutDashboard,
  LockKeyhole,
  MessageSquare,
  Palette,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = {
  title: "ابدأ مع ZOOKA AI · Preview",
  robots: { index: false, follow: false },
};
const entries = [
  {
    href: "/register",
    icon: UserRound,
    title: "إنشاء حساب / Register",
    detail:
      "التسجيل بالبريد وكلمة المرور؛ يلزم اتصال قاعدة بيانات صالح. لم يُثبت القبول الحي بحساب اختبار.",
  },
  {
    href: "/login",
    icon: LockKeyhole,
    title: "تسجيل الدخول / Sign in",
    detail:
      "Google وغيره يظهر فقط عند تهيئته. لا تدخل مفاتيح API في نموذج الدخول.",
  },
  {
    href: "/workspace",
    icon: LayoutDashboard,
    title: "مساحتي / Workspace",
    detail:
      "بيانات المساحة والأعضاء؛ يتطلب تسجيل الدخول وقراءة قاعدة البيانات.",
  },
  {
    href: "/",
    icon: MessageSquare,
    title: "المحادثة / AI Chat",
    detail: "المحادثة تظهر بعد الدخول؛ إرسال الرسالة قد يستدعي مزوداً بتكلفة.",
  },
  {
    href: "/creative",
    icon: Palette,
    title: "الاستوديو / Creative Studio",
    detail:
      "محرر طبقات وقوالب وتصدير يعمل محلياً دون حساب؛ التوليد منفصل ويتطلب إعداداً وموافقة.",
  },
  {
    href: "/command-center",
    icon: Bot,
    title: "مركز القيادة / Command Center",
    detail:
      "واجهة الأوامر متاحة. التقارير الفعلية تحتاج مسؤول مساحة، ولا يوجد تنفيذ ذاتي أو جدول يومي.",
  },
  {
    href: "/integration-hub",
    icon: Cable,
    title: "التكاملات / Integration Hub",
    detail:
      "كتالوج ومتطلبات؛ VERIFIED يحتاج اختبار قراءة حديثاً، لا مجرد مفتاح محفوظ.",
  },
  {
    href: "/private-library",
    icon: LockKeyhole,
    title: "المكتبة الخاصة / Private Library",
    detail:
      "هيكل قيد الحماية فقط. تخزين الملفات والأسرار معطل ولا يوجد حقل لاستقبالها.",
  },
];
export default function Page() {
  return (
    <main
      className="mx-auto min-h-dvh max-w-6xl space-y-8 px-5 py-10"
      dir="rtl"
      lang="ar"
    >
      <header className="space-y-3">
        <p className="font-semibold text-[#2E86AB]">
          Innovate • Automate • Grow
        </p>
        <h1 className="text-4xl font-bold">ZOOKA AI · نسخة التجربة</h1>
        <p>تقنية بإيمان، تقدم بأخلاق.</p>
        <p className="rounded-xl border border-amber-500 p-4">
          Preview للمراجعة وليست شهادة جاهزية إنتاجية. الدخول وقاعدة البيانات
          والمحادثة الحية ما زالت تحتاج قبولاً بحساب اختبار وبيئة معزولة. لا
          تستخدم بيانات أو أسراراً حقيقية قبل ذلك.
        </p>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        {entries.map(({ href, icon: Icon, title, detail }) => (
          <article className="space-y-3 rounded-2xl border p-6" key={href}>
            <Icon aria-hidden="true" className="text-[#2E86AB]" />
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-muted-foreground leading-7">{detail}</p>
            <Link
              className="inline-block rounded-lg border px-4 py-2 font-medium hover:border-[#A23B72]"
              href={href}
            >
              فتح / Open
            </Link>
          </article>
        ))}
      </section>
      <section className="rounded-2xl border p-6">
        <h2 className="text-xl font-semibold">
          خطوات البداية / Getting started
        </h2>
        <ol className="mt-3 list-inside list-decimal space-y-3">
          <li>
            ابدأ بالمحرر المحلي لاختبار التصميم والتصدير دون حساب أو إنفاق.
          </li>
          <li>
            التسجيل والدخول متاحان كمسارات، لكن اختبارهما الحي يحتاج تأكيد قاعدة
            Preview المعزولة. لا يُطلب منك إرسال كلمة مرور في المحادثة.
          </li>
          <li>
            بعد الدخول افتح المساحة ثم المحادثة؛ لا ترسل ملفات حساسة أو مفاتيح
            ضمن المحادثات.
          </li>
          <li>
            إعدادات الحساب أو التوليد أو النشر لا تتغير لمجرد فتح هذه الصفحة.
          </li>
        </ol>
      </section>
    </main>
  );
}
