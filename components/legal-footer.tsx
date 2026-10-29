import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { getLegalPageCopy, type LegalPageId } from "@/lib/legal-copy";

const pages = [
  ["Partners", "/partners"],
  ["about", "/about"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["refund", "/refund"],
  ["contact", "/contact"],
  ["cookies", "/cookies"],
] as const satisfies readonly [LegalPageId | "Partners", string][];

export function LegalFooter({ lang }: { lang: Lang }) {
  return (
    <footer
      className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t px-4 py-5 text-sm text-muted-foreground"
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
    >
      {pages.map(([page, href]) => (
        <Link className="hover:underline" href={href} key={href}>
          {page === "Partners"
            ? lang === "ar"
              ? "الشركاء"
              : "Partners"
            : getLegalPageCopy(lang, page).title}
        </Link>
      ))}
    </footer>
  );
}
