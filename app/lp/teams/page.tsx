import type { Metadata } from "next";
import { UseCaseLanding } from "@/components/use-case-landing";
export const metadata: Metadata = {
  title: "مسودات وخطط لفرق الخدمات | Zooka AI",
  description:
    "جهّز ردود العملاء وعروض الخدمات وخطط المحتوى، وراجع المخرجات قبل التنفيذ.",
  alternates: { canonical: "https://zooka-ai.com/lp/teams" },
};
export default function Page() {
  return <UseCaseLanding audience="teams" />;
}
