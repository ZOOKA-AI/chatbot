import Link from "next/link";
import { getLegalPageCopy, type LegalPageId } from "@/lib/legal-copy";
import type { Lang } from "@/lib/i18n";

const pages = [
  ["about", "/about"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["refund", "/refund"],
  ["contact", "/contact"],
  ["cookies", "/cookies"],
] as const satisfies readonly [LegalPageId, string][];

export function LegalFooter({ lang }: { lang: Lang }) {
  return (
    <footer
      className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t px-4 py-5 text-sm text-muted-foreground"
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
    >
      {pages.map(([page, href]) => (
        <Link className="hover:underline" href={href} key={href}>
          {getLegalPageCopy(lang, page).title}
        </Link>
      ))}
    </footer>
  );
}
