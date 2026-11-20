import { LanguageToggle } from "@/components/language-toggle";
import {
  BILLING_EMAIL,
  COMPANY_ADDRESS,
  COMPANY_COUNTRY,
  COMPANY_LEGAL_NAME_AR,
  COMPANY_LEGAL_NAME_EN,
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
  PRIVACY_EMAIL,
} from "@/lib/brand";
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
              {section.body}
            </p>
          </section>
        ))}
        <section
          className="space-y-2 border-t pt-5"
          aria-label="Operator identity"
        >
          <p dir="ltr">{COMPANY_LEGAL_NAME_EN}</p>
          {COMPANY_LEGAL_NAME_AR && <p>{COMPANY_LEGAL_NAME_AR}</p>}
          <p dir="ltr">{COMPANY_ADDRESS}</p>
          <p>{COMPANY_COUNTRY}</p>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> ·{" "}
            <a href={`tel:${CONTACT_PHONE_E164}`}>
              <bdi dir="ltr">{CONTACT_PHONE_DISPLAY}</bdi>
            </a>{" "}
            ·{" "}
            <a
              href={`https://wa.me/${CONTACT_PHONE_E164.slice(1)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
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
