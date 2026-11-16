import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { BrowserConsole } from "@/components/browser-console";

export default async function BrowserPage() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  return <BrowserConsole />;
}
