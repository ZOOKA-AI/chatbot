import { captureException } from "@sentry/nextjs";
import { ipAddress } from "@vercel/functions";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { deleteAccountData } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { getLang } from "@/lib/i18n";
import { checkIpRateLimit } from "@/lib/ratelimit";

const confirmationSchema = z
  .object({ confirmation: z.literal("DELETE") })
  .strict();

export async function DELETE(request: Request) {
  const isArabic = (await getLang()) === "ar";
  try {
    await checkIpRateLimit(ipAddress(request));
  } catch (error) {
    if (error instanceof ChatbotError) {
      return NextResponse.json(
        { error: "تم تجاوز عدد المحاولات. حاول مرة أخرى لاحقاً." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "تعذّر التحقق من الطلب. حاول مرة أخرى." },
      { status: 503 }
    );
  }

  const context = await getWorkspaceContext();
  if (!context || context.user.type === "guest") {
    return NextResponse.json(
      { error: "يجب تسجيل الدخول أولاً." },
      { status: 401 }
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = confirmationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "أكّد حذف الحساب بكتابة DELETE." },
      { status: 400 }
    );
  }

  try {
    const result = await deleteAccountData(context.user.id);
    if (!result.deleted) {
      const error =
        result.reason === "workspace_members"
          ? isArabic
            ? "انقل ملكية مساحات العمل أو أزل الأعضاء الآخرين قبل حذف حسابك."
            : "Transfer ownership or remove other members from each owned workspace before deleting your account."
          : result.reason === "active_subscription"
            ? isArabic
              ? "ألغِ الاشتراكات النشطة قبل حذف حسابك."
              : "Cancel all active subscriptions before deleting your account."
            : isArabic
              ? "تخزين الملفات غير مُعدّ، لذلك لا يمكن حذف الملفات بأمان. تواصل مع الدعم."
              : "File storage is not configured, so uploaded files cannot be safely deleted. Contact support.";
      return NextResponse.json(
        { error, reason: result.reason },
        { status: 409 }
      );
    }
    return NextResponse.json({ deleted: true });
  } catch {
    captureException(new Error("Account deletion failed"), {
      tags: { area: "account-deletion" },
    });
    return NextResponse.json(
      {
        error: isArabic
          ? "تعذّر حذف الحساب بأمان. حاول مرة أخرى أو تواصل مع الدعم."
          : "Account data could not be safely deleted. Retry or contact support.",
      },
      { status: 500 }
    );
  }
}
