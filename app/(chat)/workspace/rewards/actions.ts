"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getLang } from "@/lib/i18n";
import { getOrCreateReferralCode } from "@/lib/growth/referrals";
import { INVITE_MAX_RECIPIENTS, sendInvitations } from "@/lib/growth/invites";

export type InviteState = {
  status: "idle" | "sent" | "error";
  message: string;
  detail?: string[];
};

/**
 * Invitations are user initiated by definition: the caller's identity comes from
 * the session, the cap comes from the database, and the recipients are taken
 * from the submitted form. Nothing is sent without this action running.
 */
export async function sendInviteAction(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const context = await getWorkspaceContext();
  if (!context) {
    return { status: "error", message: "يجب تسجيل الدخول أولًا." };
  }

  const raw = String(formData.get("recipients") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 400);
  const recipients = raw
    .split(/[\s,;\n]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, INVITE_MAX_RECIPIENTS);

  if (recipients.length === 0) {
    return { status: "error", message: "أدخل بريدًا واحدًا على الأقل." };
  }

  const lang = await getLang();
  const code = await getOrCreateReferralCode(context.user.id);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://zooka-ai.com");

  const { remaining, results } = await sendInvitations({
    inviterUserId: context.user.id,
    inviterName: context.user.email?.split("@")[0] ?? "ZOOKA-AI",
    referrerCode: code,
    baseUrl,
    lang,
    recipients,
    personalNote: note,
  });

  revalidatePath("/workspace/rewards");

  const sent = results.filter((r) => r.status === "sent").length;
  const refused = results.filter((r) => r.status !== "sent");
  return {
    status: sent > 0 ? "sent" : "error",
    message:
      sent > 0
        ? `تم إرسال ${sent} دعوة. المتبقي اليوم: ${remaining}.`
        : "لم تُرسل أي دعوة. تحقق من العناوين.",
    detail: refused.map((r) => `${r.email}: ${r.status}`),
  };
}
