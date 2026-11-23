import { redirect } from "next/navigation";

import { SkillsConsole } from "@/components/skills-console";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { dirOf, fontOf, getLang } from "@/lib/i18n";

export default async function WorkspaceSkillsPage() {
  const context = await getWorkspaceContext();
  if (!context) {
    redirect("/login");
  }

  const lang = await getLang();

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4"
      dir={dirOf(lang)}
      lang={lang}
      style={{ fontFamily: fontOf(lang) }}
    >
      <SkillsConsole canManage={["owner", "admin"].includes(String(context.role))} lang={lang} />
    </main>
  );
}
