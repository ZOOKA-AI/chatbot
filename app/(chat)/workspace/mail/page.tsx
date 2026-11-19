import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getLang } from "@/lib/i18n";
import { listFolder } from "@/lib/mail/isolation";
import { MAIL_PROVIDERS } from "@/lib/mail/providers";
import { createMailRepository } from "@/lib/mail/repository";
import { sanitizeHtml } from "@/lib/mail/sanitize";
import { isMailFolder, type MailFolder } from "@/lib/mail/types";

import { MailClient } from "./mail-client";

/**
 * Names the failure so the panel can say something true.
 *
 * "Migration not applied" and "this environment has no service connection" look
 * identical from the outside and need different fixes, so the message must not
 * guess.
 */
function classifyFailure(error: unknown): "tables_missing" | "service_connection" | "unknown" {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("DATABASE_URL_SERVICE")) return "service_connection";
  if (/relation .* does not exist|undefined_table|42P01/i.test(message)) return "tables_missing";
  return "unknown";
}

/**
 * ZOOKA Mail.
 *
 * A server component: the workspace comes from the session, the folders are read
 * with that workspace in the query, and the body of every message is sanitised
 * again on the way out even though it was sanitised on the way in. Two lines of
 * defence is the right number for markup written by a stranger.
 *
 * The reads are wrapped so a missing table, or a missing service connection,
 * shows an honest "not available here" panel with the actual reason rather than
 * a 500 that looks like the product is broken.
 */
export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ box?: string; folder?: string }>;
}) {
  const context = await getWorkspaceContext();
  if (!context?.user?.organizationId || !context.user.id) redirect("/login");

  const organizationId = context.user.organizationId;
  const userId = context.user.id;
  const { box, folder } = await searchParams;
  const activeFolder: MailFolder = isMailFolder(folder) ? folder : "inbox";
  const lang = await getLang();

  const repo = createMailRepository();
  let failure: "tables_missing" | "service_connection" | "unknown" | null = null;
  let addresses: Awaited<ReturnType<typeof repo.listAddresses>> = [];
  let drafts: Awaited<ReturnType<typeof repo.listDrafts>> = [];

  try {
    addresses = await repo.listAddresses(organizationId, userId);
    drafts = await repo.listDrafts(organizationId, userId);
  } catch (error) {
    failure = classifyFailure(error);
  }

  const active = addresses.find((entry) => entry.id === box) ?? addresses[0] ?? null;

  let messages: Array<{
    id: string;
    fromAddress: string;
    fromName: string | null;
    subject: string | null;
    snippet: string | null;
    bodyHtml: string;
    receivedAt: string;
    isRead: boolean;
    aiSummary: string | null;
  }> = [];

  if (failure === null && active) {
    try {
      const result = await listFolder({
        repo,
        organizationId,
        mailAddressId: active.id,
        folder: activeFolder,
        limit: 25,
      });
      if (result.ok) {
        messages = result.value.map((message) => ({
          id: message.id,
          fromAddress: message.fromAddress,
          fromName: message.fromName,
          subject: message.subject,
          snippet: message.snippet,
          bodyHtml: sanitizeHtml(message.bodyHtml ?? message.bodyText ?? ""),
          receivedAt: message.receivedAt.toISOString(),
          isRead: message.isRead,
          aiSummary: message.aiSummary,
        }));
      }
    } catch (error) {
      failure = classifyFailure(error);
      messages = [];
    }
  }

  return (
    <MailClient
      lang={lang === "ar" ? "ar" : "en"}
      failure={failure}
      activeFolder={activeFolder}
      mailboxes={addresses.map((entry) => ({
        id: entry.id,
        address: entry.address,
        status: entry.status,
        provider: entry.provider,
      }))}
      activeMailboxId={active?.id ?? null}
      messages={messages}
      drafts={drafts.map((draft) => ({
        id: draft.id,
        subject: draft.subject,
        to: draft.toAddresses.join(", "),
        aiGenerated: draft.aiGenerated,
        updatedAt: draft.updatedAt.toISOString(),
      }))}
      providers={MAIL_PROVIDERS.map((provider) => ({
        id: provider.id,
        label: lang === "ar" ? provider.labelAr : provider.label,
        status: provider.status,
        read: provider.read,
        send: provider.send,
        requirement: provider.requirement,
      }))}
    />
  );
}
