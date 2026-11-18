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
 * ZOOKA Mail.
 *
 * A server component: the workspace comes from the session, the folders are read
 * with that workspace in the query, and the body of every message is sanitised
 * again on the way out even though it was sanitised on the way in. Two lines of
 * defence is the right number for markup written by a stranger.
 *
 * The reads are wrapped because migration 0059 has not been applied to this
 * environment. A missing table must show an honest "not activated" panel, not a
 * 500 that looks like the product is broken.
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
  let ready = true;
  let addresses: Awaited<ReturnType<typeof repo.listAddresses>> = [];
  let drafts: Awaited<ReturnType<typeof repo.listDrafts>> = [];

  try {
    addresses = await repo.listAddresses(organizationId, userId);
    drafts = await repo.listDrafts(organizationId, userId);
  } catch {
    ready = false;
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

  if (ready && active) {
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
    } catch {
      ready = false;
    }
  }

  return (
    <MailClient
      lang={lang === "ar" ? "ar" : "en"}
      ready={ready}
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
