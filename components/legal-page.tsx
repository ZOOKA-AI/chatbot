import { LanguageToggle } from "@/components/language-toggle";
import {
  BILLING_EMAIL,
  COMPANY_ADDRESS,
  COMPANY_COUNTRY,
  COMPANY_LEGAL_NAME_AR,
  COMPANY_LEGAL_NAME_EN,
  CONTACT_EMAIL,
  PRIVACY_EMAIL,
} from "@/lib/brand";
import {
  MASKED_COMPANY_FIELD,
  MASKED_PHONE_LABEL,
  maskLegalText,
  WHATSAPP_SUPPORT_URL,
} from "@/lib/brand-display";
import { dirOf, fontOf, getLang } from "@/lib/i18n";
import { getLegalPageCopy, type LegalPageId } from "@/lib/legal-copy";

export async function LegalPage({ page }: { page: LegalPageId }) {
  const lang = await getLang();
  const copy = getLegalPageCopy(lang, page);

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 p-6 py-12"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <div className="absolute top-4 end-4 z-10">
        <LanguageToggle lang={lang} />
      </div>
      <article className="flex flex-col gap-6">
        <h1 className="font-semibold text-3xl">{copy.title}</h1>
        {copy.sections.map((section) => (
          <section className="flex flex-col gap-2" key={section.title}>
            <h2 className="font-medium text-xl">{section.title}</h2>
            <p className="whitespace-pre-line text-muted-foreground leading-7">
              {maskLegalText(section.body, [
                COMPANY_LEGAL_NAME_EN,
                COMPANY_LEGAL_NAME_AR,
                COMPANY_ADDRESS,
                COMPANY_COUNTRY,
              ])}
            </p>
          </section>
        ))}
        <section
          className="space-y-2 border-t pt-5"
          aria-label="Operator identity"
        >
          <p dir="ltr">{MASKED_COMPANY_FIELD}</p>
          {COMPANY_LEGAL_NAME_AR && <p>{MASKED_COMPANY_FIELD}</p>}
          <p dir="ltr">{MASKED_COMPANY_FIELD}</p>
          <p>{MASKED_COMPANY_FIELD}</p>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> ·{" "}
            <a
              href={WHATSAPP_SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={
                lang === "ar"
                  ? "الدعم عبر واتساب فقط"
                  : "Support via WhatsApp only"
              }
            >
              <bdi dir="ltr">{MASKED_PHONE_LABEL}</bdi> · WhatsApp
            </a>
          </p>
          <p>
            <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> ·{" "}
            <a href={`mailto:${BILLING_EMAIL}`}>{BILLING_EMAIL}</a>
          </p>
        </section>
      </article>
    </main>
  );
}
