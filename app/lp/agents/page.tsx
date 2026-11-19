import type { Metadata } from "next";
import { UseCaseLanding } from "@/components/use-case-landing";
export const metadata: Metadata = {
  title: "مساحتك للأفكار والمشروعات | Zooka AI",
  description:
    "ابدأ بهدف واضح واكتشف قوالب للعمل والكتابة والتخطيط مع مراجعة بشرية لكل خطوة.",
  alternates: { canonical: "https://zooka-ai.com/lp/agents" },
};
export default function Page() {
  return <UseCaseLanding audience="agents" />;
}
