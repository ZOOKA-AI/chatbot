"use client";

import { ExternalLink, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { implementedConnectionIds } from "@/lib/studio";
import { providerGuides } from "@/lib/studio-provider-guides";
import { ProviderIcon } from "./provider-icon";
import styles from "./studio.module.css";

export function ProviderGuide({
  provider,
  onClose,
}: {
  provider: { id: string; name: string };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const guide = providerGuides[provider.id];
  const implemented = implementedConnectionIds.has(provider.id);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      aria-labelledby="provider-guide-title"
      className={styles.modalBackdrop}
      onClose={onClose}
      ref={ref}
    >
      <section className={styles.actionSheet}>
        <div className={styles.sectionHeading}>
          <span className={styles.providerIcon}>
            <ProviderIcon id={provider.id} />
          </span>
          <h2 id="provider-guide-title">دليل ربط {provider.name}</h2>
          <button
            aria-label="إغلاق دليل الربط"
            className={styles.iconButton}
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        <p className={styles.muted}>
          {implemented
            ? "مسار إعداد موجود في التطبيق؛ حالة اتصال حسابك لا تُقرأ في هذه المعاينة العامة."
            : "لا يوجد موصل منفّذ لهذه الخدمة في النسخة الحالية. هذه متطلبات وليست اتصالاً نشطاً."}
        </p>
        {guide ? (
          <>
            <p className={styles.guideAuth}>{guide.auth}</p>
            <ol className={styles.guideSteps}>
              {guide.requirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <a
              className={styles.secondary}
              href={guide.source}
              rel="noopener noreferrer"
              target="_blank"
            >
              وثائق المزوّد <ExternalLink size={15} />
            </a>
            <p className={styles.muted}>
              مراجعة المتطلبات: 31 أكتوبر 2026. قد يغيّر المزوّد شروطه، وتبقى
              الموافقة لديه.
            </p>
          </>
        ) : (
          <div className={styles.releaseNote}>
            <ShieldCheck size={22} />
            <p>
              لم تُوثّق خطوات خاصة بهذا المنتج في دليل النسخة بعد. يلزم تحديد
              واجهة الخدمة، والتحقق من شروطها، ثم تنفيذ موصل واختباره؛ لا نعرض
              حقول توكنات قبل ذلك.
            </p>
          </div>
        )}
        {implemented && (
          <Link className={styles.primary} href="/settings/integrations">
            فتح إعدادات الربط <ExternalLink size={15} />
          </Link>
        )}
        <p className={styles.muted}>
          لا تضع أسراراً هنا أو في المحادثة. تفويض المستخدم منفصل عن تسجيل تطبيق
          المنصة، وOAuth وحده لا ينفّذ أدوات الوكيل.
        </p>
      </section>
    </dialog>
  );
}
