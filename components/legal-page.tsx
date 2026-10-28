import { LanguageToggle } from "@/components/language-toggle";
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
      </article>
    </main>
  );
}
