import { redirect } from "next/navigation";

/**
 * /workspace/integrations answered 404 while the real catalogue lives at /settings/integrations.
 * The redirect keeps both entry points working and leaves one implementation of the page.
 */
export default function WorkspaceIntegrationsPage() {
  redirect("/settings/integrations");
}
