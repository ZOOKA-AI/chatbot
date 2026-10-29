import { Suspense } from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `شروط الاستخدام`,
  description: `شروط استخدام منصة Zooka AI: الاشتراكات والاستخدام العادل.`,
  alternates: { canonical: "./" },
};
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

async function TermsContent() {
  const lang = await getLang();
  const ar = lang === "ar";

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 p-6 py-16"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <div className="absolute top-4 end-4 z-10">
        <LanguageToggle lang={lang} />
      </div>
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          {ar ? "قانوني" : "Legal"}
        </p>
        <h1 className="font-semibold text-3xl">
          {ar ? "شروط الخدمة" : "Terms of Service"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ar ? "آخر تحديث: 23 أكتوبر 2026" : "Last updated: October 23, 2026"}
        </p>
      </header>

      <section className="flex flex-col gap-4 text-sm leading-relaxed">
        {ar ? (
          <>
            <p>
              تحكم هذه الشروط استخدامك لخدمة المحادثة الذكية زوكا إيه آي على
              موقع zooka-ai.com. بإنشاء حساب أو استخدام الخدمة فأنت تقبل هذه
              الشروط.
            </p>

            <h2 className="font-semibold text-lg">الخدمة</h2>
            <p>
              تقدم زوكا إيه آي محادثات ذكية بالذكاء الاصطناعي. حدود الرسائل
              تعتمد على باقتك: المجانية (1,000 رسالة شهرياً)، الاحترافية (19$
              شهرياً، 10,000 رسالة)، والأعمال (49$ شهرياً، 100,000 رسالة).
            </p>

            <h2 className="font-semibold text-lg">حسابك</h2>
            <p>
              أنت مسؤول عن الحفاظ على بيانات دخولك وعن أي نشاط يتم عبر حسابك،
              ويجب أن تقدم معلومات صحيحة عند التسجيل.
            </p>

            <h2 className="font-semibold text-lg">الاستخدام المقبول</h2>
            <p>
              لا يجوز استخدام الخدمة لأغراض غير قانونية، أو لتوليد محتوى ضار أو
              مسيء، أو لمحاولة تجاوز حدود الباقة، أو لتعطيل الخدمة. يحق لنا
              إيقاف الحسابات المخالفة لهذه القواعد.
            </p>

            <h2 className="font-semibold text-lg">الاشتراكات والفوترة</h2>
            <p>
              تتجدد الباقات المدفوعة شهرياً حتى الإلغاء. تُعالَج المدفوعات عبر
              Stripe. يمكنك الإلغاء في أي وقت، ويستمر وصولك للميزات المدفوعة
              حتى نهاية الفترة المدفوعة.
            </p>

            <h2 className="font-semibold text-lg">تنبيه بشأن مخرجات الذكاء الاصطناعي</h2>
            <p>
              قد تكون ردود الذكاء الاصطناعي غير دقيقة أو ناقصة. لا تعتمد عليها
              في قرارات مهنية أو طبية أو قانونية أو مالية.
            </p>

            <h2 className="font-semibold text-lg">حدود المسؤولية</h2>
            <p>
              تقدم الخدمة &quot;كما هي&quot; دون ضمانات. وبالقدر الأقصى المسموح
              به قانوناً، لا تتحمل زوكا إيه آي مسؤولية أي أضرار غير مباشرة أو
              تبعية ناتجة عن استخدام الخدمة.
            </p>

            <h2 className="font-semibold text-lg">التغييرات</h2>
            <p>
              قد نحدّث هذه الشروط، وتُعكس التغييرات الجوهرية في التاريخ أعلاه.
              استمرارك في الاستخدام بعد أي تغيير يعني قبولك له.
            </p>

            <h2 className="font-semibold text-lg">التواصل</h2>
            <p>أسئلة حول هذه الشروط: zookaalmrzwq@gmail.com</p>
          </>
        ) : (
          <>
            <p>
              These Terms govern your use of the Zooka AI chatbot service at
              zooka-ai.com. By creating an account or using the service, you
              accept these terms.
            </p>

            <h2 className="font-semibold text-lg">The service</h2>
            <p>
              Zooka AI provides AI-powered chatbot conversations. Message limits
              depend on your plan: Free (1,000 messages per month), Pro ($19
              per month, 10,000 messages), and Business ($49 per month, 100,000
              messages).
            </p>

            <h2 className="font-semibold text-lg">Your account</h2>
            <p>
              You are responsible for keeping your credentials safe and for
              activity under your account. You must provide accurate information
              when registering.
            </p>

            <h2 className="font-semibold text-lg">Acceptable use</h2>
            <p>
              You may not use the service for illegal purposes, to generate
              harmful or abusive content, to attempt to bypass plan limits, or
              to disrupt the service. We may suspend accounts that violate
              these rules.
            </p>

            <h2 className="font-semibold text-lg">Subscriptions and billing</h2>
            <p>
              Paid plans renew monthly until cancelled. Payments are processed
              by Stripe. You can cancel at any time; access to paid features
              continues until the end of the paid period.
            </p>

            <h2 className="font-semibold text-lg">AI output disclaimer</h2>
            <p>
              AI responses may be inaccurate or incomplete. Do not rely on them
              for professional, medical, legal, or financial decisions.
            </p>

            <h2 className="font-semibold text-lg">Limitation of liability</h2>
            <p>
              The service is provided &quot;as is&quot; without warranties. To
              the maximum extent permitted by law, Zooka AI is not liable for
              indirect or consequential damages arising from use of the
              service.
            </p>

            <h2 className="font-semibold text-lg">Changes</h2>
            <p>
              We may update these terms; material changes will be reflected in
              the date above. Continued use after changes means you accept
              them.
            </p>

            <h2 className="font-semibold text-lg">Contact</h2>
            <p>Questions about these terms: zookaalmrzwq@gmail.com</p>
          </>
        )}
      </section>

      <footer className="text-muted-foreground flex gap-4 text-sm">
        <Link className="hover:underline" href="/privacy">
          {ar ? "سياسة الخصوصية" : "Privacy Policy"}
        </Link>
        <Link className="hover:underline" href="/pricing">
          {ar ? "الباقات والأسعار" : "Pricing"}
        </Link>
      </footer>
    </main>
  );
}

export default function TermsPage() {
  return (
    <Suspense fallback={null}>
      <TermsContent />
    </Suspense>
  );
}
