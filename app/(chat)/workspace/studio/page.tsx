import { redirect } from "next/navigation";

import { StudioConsole } from "@/components/studio-console";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export default async function StudioPage() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  return <StudioConsole />;
}
