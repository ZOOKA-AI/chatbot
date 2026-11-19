import { redirect } from "next/navigation";

/**
 * /workspace/automations used to answer 404, and the "Automation" tile on the home page pointed here.
 *
 * The read-only n8n overview is the real surface, at /workspace/admin/n8n. A redirect is the honest
 * fix: it keeps every existing bookmark working, it does not invent a second automations page, and it
 * does not claim a builder that does not exist. Execution still happens in n8n, never here.
 */
export default function WorkspaceAutomationsPage() {
  redirect("/workspace/admin/n8n");
}
