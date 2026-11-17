import { redirect } from "next/navigation";

import { LiveBrowser } from "@/components/live-browser";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export const metadata = { title: "المتصفح المباشر — ZOOKA AI" };

export default async function LiveBrowserPage() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  return (
    <div className="px-4 py-6">
      <LiveBrowser />
    </div>
  );
}
