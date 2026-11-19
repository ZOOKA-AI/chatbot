import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Studio } from "@/components/studio/studio";
import { isStudioSection, studioSections } from "@/lib/studio";

export const metadata: Metadata = {
  title: "Zooka Studio — نسخة المراجعة",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return [
    { section: [] },
    ...studioSections
      .filter((s) => s.id !== "home")
      .map((s) => ({ section: [s.id] })),
  ];
}

/** Public, isolated review surface. No user/session data or secrets are loaded. */
export default async function StudioPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  const selected = section?.[0] ?? "home";
  if ((section?.length ?? 0) > 1 || !isStudioSection(selected)) notFound();
  return <Studio key={selected} section={selected} />;
}
