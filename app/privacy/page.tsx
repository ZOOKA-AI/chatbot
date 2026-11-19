import { Suspense } from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `سياسة الخصوصية`,
  description: `سياسة الخصوصية في Zooka AI: كيف نجمع بياناتك ونحميها.`,
  alternates: { canonical: "./" },
};
import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

async function PrivacyContent() {
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
          {ar ? "سياسة الخصوصية" : "Privacy Policy"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {ar ? "آخر تحديث: 30 أكتوبر 2026" : "Last updated: October 30, 2026"}
        </p>
      </header>

      <section className="flex flex-col gap-4 text-sm leading-relaxed">
        {ar ? (
          <>
            <p>
              توضح سياسة الخصوصية هذه كيف تجمع زوكا إيه آي (&quot;نحن&quot;)
              معلوماتك وتستخدمها وتحميها عند استخدامك خدمة المحادثة الذكية على
              موقع zooka-ai.com. بإنشاء حساب أو استخدام الخدمة فأنت توافق على
              الممارسات الموضحة هنا.
            </p>

            <h2 className="font-semibold text-lg">المعلومات التي نجمعها</h2>
            <ul className="flex list-disc flex-col gap-2 ps-5">
              <li>
                بيانات الحساب: بريدك الإلكتروني وكلمة المرور (تُخزَّن كتشفير
                آمن فقط).
              </li>
              <li>
                محتوى المحادثات: الرسائل التي ترسلها والردود المولَّدة، وتُحفظ
                لتتمكن من العودة لمحادثاتك.
              </li>
              <li>
                بيانات الاستخدام: عدّاد الرسائل المستخدم لفرض حدود باقتك
                ولتحسين الخدمة.
              </li>
            </ul>

            <h2 className="font-semibold text-lg">كيف نستخدم معلوماتك</h2>
            <p>
              نستخدم معلوماتك لتشغيل الخدمة والحفاظ على سجل محادثاتك وفرض حدود
              الرسائل حسب الباقة ومعالجة مدفوعات الاشتراك ومنع إساءة الاستخدام.
            </p>

            <h2 className="font-semibold text-lg">مزوّدو نماذج الذكاء الاصطناعي</h2>
            <p>
              لتوليد الردود تُعالَج رسائلك لدى مزوّدي نماذج ذكاء اصطناعي من
              جهات خارجية. لا تشارك معلومات شخصية أو مالية أو سرية حساسة في
              المحادثات.
            </p>

            <h2 className="font-semibold text-lg">بيانات Google (Gmail وGoogle Drive)</h2>
            <p>
              عند ربط حساب Google بمساحة عملك، يطلب التطبيق ثلاث صلاحيات:
              قراءة Gmail (gmail.readonly)، وإرسال بريد من Gmail (gmail.send)،
              وقراءة Google Drive (drive.readonly). يستخدم الوكيل هذه الصلاحيات
              للبحث عن رسائل البريد وقراءتها، ولإرسال رسالة بريد نيابةً عنك
              عندما تطلب ذلك صراحةً، وللبحث عن ملفات Drive وقراءة نصها عند
              طلبك فقط.
            </p>
            <ul className="flex list-disc flex-col gap-2 ps-5">
              <li>
                لا وصول تدميري: لا يستطيع التطبيق حذف بريد أو تعديله، ولا
                إنشاء ملفات في Drive أو تعديلها أو حذفها. الإرسال محدود برسالة
                نصية واحدة يصوغها الوكيل بناءً على طلبك، وتظهر لك في المحادثة.
              </li>
              <li>
                تُخزَّن رموز OAuth (access وrefresh token) مشفّرة بمفتاح خاص
                بالخادم، ومرتبطة بمساحة عملك وحدها.
              </li>
              <li>
                يمكنك إلغاء الربط في أي وقت من صفحة التكاملات، فيُحذف الاتصال
                المشفّر ويُطلب إبطال التفويض من Google.
              </li>
              <li>
                لا نبيع بيانات Google الخاصة بك، ولا نستخدمها للإعلانات، ولا
                لتدريب نماذج ذكاء اصطناعي عامة.
              </li>
              <li>
                نص الرسالة أو الملف الذي يطلبه الوكيل يُرسل إلى مزوّد النموذج
                لتوليد الرد، ويُحفظ ضمن سجل المحادثة كما هو موضح أعلاه. لا
                يُخزَّن محتوى بريدك أو ملفاتك بشكل منفصل على خوادمنا.
              </li>
              <li>
                استخدام التطبيق لبيانات Google يلتزم بسياسة بيانات مستخدمي
                Google، بما في ذلك متطلبات الاستخدام المحدود (Limited Use).
              </li>
            </ul>

            <h2 className="font-semibold text-lg">المدفوعات</h2>
            <p>
              تُعالَج الباقات المدفوعة عبر Stripe. نحن لا نرى تفاصيل بطاقتك ولا
              نخزنها؛ يتولى Stripe جميع بيانات الدفع.
            </p>

            <h2 className="font-semibold text-lg">الاحتفاظ بالبيانات</h2>
            <p>
              تُحفظ محادثاتك وبيانات حسابك ما دام حسابك نشطاً. يمكنك طلب حذف
              حسابك وبياناتك المرتبطة في أي وقت بالتواصل معنا.
            </p>

            <h2 className="font-semibold text-lg">حقوقك</h2>
            <p>
              يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها بالتواصل معنا
              عبر البريد أدناه.
            </p>

            <h2 className="font-semibold text-lg">التواصل</h2>
            <p>أسئلة حول هذه السياسة: zookaalmrzwq@gmail.com</p>
          </>
        ) : (
          <>
            <p>
              This Privacy Policy explains how Zooka AI (&quot;we&quot;,
              &quot;us&quot;) collects, uses, and protects your information when
              you use our chatbot service at zooka-ai.com. By creating an account
              or using the service, you agree to the practices described here.
            </p>

            <h2 className="font-semibold text-lg">Information we collect</h2>
            <ul className="flex list-disc flex-col gap-2 pl-5">
              <li>
                Account information: your email address and password (stored
                only as a secure hash).
              </li>
              <li>
                Chat content: the messages you send and the responses
                generated, saved so you can revisit your conversations.
              </li>
              <li>
                Usage information: message counts used to enforce your plan
                limits and improve the service.
              </li>
            </ul>

            <h2 className="font-semibold text-lg">How we use your information</h2>
            <p>
              We use your information to operate the service, maintain your
              chat history, enforce plan message limits, process subscription
              payments, and prevent abuse.
            </p>

            <h2 className="font-semibold text-lg">AI model providers</h2>
            <p>
              To generate responses, your messages are processed by third-party
              AI model providers. Do not share sensitive personal, financial,
              or confidential information in chats.
            </p>

            <h2 className="font-semibold text-lg">Google user data (Gmail and Google Drive)</h2>
            <p>
              When you connect a Google account to your workspace, the app
              requests three scopes: Gmail read access (gmail.readonly), Gmail
              send access (gmail.send), and Google Drive read access
              (drive.readonly). The Agent uses them to search and read email
              messages, to send an email on your behalf when you explicitly ask
              it to, and to search Drive files and read their text, only when
              you ask.
            </p>
            <ul className="flex list-disc flex-col gap-2 pl-5">
              <li>
                No destructive access: the app cannot delete or modify existing
                email, cannot read Drive files it was not asked about, and
                cannot create, edit, or delete Drive files. Sending is limited
                to a single plain-text message the Agent composes when you ask
                for it, and every send is shown to you in the conversation.
              </li>
              <li>
                OAuth tokens (access and refresh) are stored encrypted with a
                server-held key and scoped to your workspace only.
              </li>
              <li>
                You can disconnect at any time from the integrations page,
                which removes the encrypted connection and asks Google to
                revoke the grant.
              </li>
              <li>
                We do not sell your Google data, use it for advertising, or use
                it to train generalized AI models.
              </li>
              <li>
                The email or file text the Agent reads is sent to the model
                provider to produce the answer and is retained in your chat
                history as described above. Your mail or file content is not
                stored separately on our servers.
              </li>
              <li>
                This app&apos;s use of Google data complies with the Google API
                Services User Data Policy, including Limited Use requirements.
              </li>
            </ul>

            <h2 className="font-semibold text-lg">Payments</h2>
            <p>
              Paid plans are processed by Stripe. We never see or store your
              card details; Stripe handles all payment data.
            </p>

            <h2 className="font-semibold text-lg">Data retention</h2>
            <p>
              Your chats and account data are retained while your account is
              active. You may request deletion of your account and associated
              data at any time by contacting us.
            </p>

            <h2 className="font-semibold text-lg">Your rights</h2>
            <p>
              You may request access to, correction of, or deletion of your
              personal data by contacting us below.
            </p>

            <h2 className="font-semibold text-lg">Contact</h2>
            <p>Questions about this policy: zookaalmrzwq@gmail.com</p>
          </>
        )}
      </section>

      <footer className="text-muted-foreground flex gap-4 text-sm">
        <Link className="hover:underline" href="/terms">
          {ar ? "شروط الخدمة" : "Terms of Service"}
        </Link>
        <Link className="hover:underline" href="/pricing">
          {ar ? "الباقات والأسعار" : "Pricing"}
        </Link>
      </footer>
    </main>
  );
}

export default function PrivacyPage() {
  return (
    <Suspense fallback={null}>
      <PrivacyContent />
    </Suspense>
  );
}
